import * as path from "path";
import { promises as fs } from "fs";

import { processMarkdownNotes } from './process_markdown_note.js';
import {breadthFirstSearch} from "./common/bfs.js";

const markdownDirectory = process.env['OBSIDIAN_VAULT_DIR'];
if(!markdownDirectory) {
    throw new Error("Please specify an Obsidian Vault.");
}

async function readAndProcessFile(fileFullPath: string) {
    const markdownContent = await fs.readFile(fileFullPath, 'utf-8');
    await processMarkdownNotes(markdownContent);
}

async function traverseDirectoryTree(rootDir: string) {
    const visitor = async (nextDirectory: string, enqueue: (e: string) => void) => {
        for (const filename of await fs.readdir(nextDirectory)) {
            const fileFullPath = path.join(nextDirectory, filename);
            const contentStats = await fs.lstat(fileFullPath);

            if(contentStats.isFile()) {
                const fileExtension = path.extname(filename);

                if(fileExtension === '.md') {
                    await readAndProcessFile(fileFullPath);
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

    console.log("Done ?")
}

await traverseDirectoryTree(markdownDirectory);

