import * as path from "path";
import fsBase, {promises as fs} from "fs";

import { processMarkdownNotes } from './process_markdown_note.js';
import {breadthFirstSearch} from "./common/bfs.js";
import {syncToAnki} from "./anki-sync.js";

const markdownDirectory = process.env['OBSIDIAN_VAULT_DIR'];
if(!markdownDirectory) {
    throw new Error("Please specify an Obsidian Vault.");
}

async function readAndProcessFile(fileFullPath: string) {
    const markdownContent = await fs.readFile(fileFullPath, 'utf-8');
    return {
        cards: await processMarkdownNotes(markdownContent),
        markdownContent
    };
}

async function traverseDirectoryTree(rootDir: string) {
    const visitor = async (nextDirectory: string, enqueue: (e: string) => void) => {
        for (const filename of await fs.readdir(nextDirectory)) {
            const fileFullPath = path.join(nextDirectory, filename);
            const contentStats = await fs.lstat(fileFullPath);

            if(contentStats.isFile()) {
                const fileExtension = path.extname(filename);

                if(fileExtension === '.md') {
                    // Extract & sync to anki
                    const { cards, markdownContent } = await readAndProcessFile(fileFullPath);
                    await syncToAnki(cards);

                    // Store anki IDs.
                    const linesToCardInjectionHintsMap: Record<number, typeof cards[0]> = cards.reduce((acc, card) => {
                        if(card.needsNewCardIDInjection && card.placeToInjectIDContainer && card.id) {
                            return {
                                ...acc,
                                [card.placeToInjectIDContainer.line]: card
                            };
                        }

                        return acc;
                    }, {});

                    if(Object.values(linesToCardInjectionHintsMap).length === 0) {
                        // No need to inject anything, jump to the next document.
                        continue;
                    }

                    const tmpFilename = path.join(
                        path.dirname(fileFullPath),
                        `${path.basename(fileFullPath)}.tmp`
                    );

                    const writeStream = fsBase.createWriteStream(
                        tmpFilename,
                        {
                            encoding: 'utf-8',
                            flags: "w",
                            mode: contentStats.mode,
                            autoClose: true
                        }
                    );

                    let lineCount = 0;
                    for(const line of markdownContent.split("\n")) {
                        lineCount++;

                        writeStream.write(line);

                        // Just append to the end of the line... ?
                        const idInjection = linesToCardInjectionHintsMap[lineCount];
                        if (idInjection) {
                            writeStream.write(`<!--🔮 ${idInjection.id}-->`);
                        }

                        writeStream.write("\n");
                    }
                    writeStream.close();

                    await new Promise((resolve, rejects) => {
                        writeStream.on('error', rejects);
                        writeStream.on('finish', resolve);
                    });

                    // Success - replace the source file.
                    // todo: option to nuke the old file ?
                    await fs.rename(fileFullPath, `${tmpFilename}.bak`);
                    await fs.rename(tmpFilename, fileFullPath);
                }
            } else if(contentStats.isDirectory()) {
                enqueue(fileFullPath);
            }
        }
    }

    await breadthFirstSearch<string>(
        rootDir,
        visitor
    );

    console.log("Done ?");
}

await traverseDirectoryTree(markdownDirectory);

