import * as path from "path";
import { promises as fs } from "fs";
import Denque from "denque";

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
            const contentStats = await fs.lstat(filename);
            if(contentStats.isFile()) {
                const fileExtension = path.extname(filename);

                if(fileExtension === '.md') {
                    const fileFullPath = path.join(nextDirectory, filename);
                    // await readAndProcessFile(fileFullPath);
                }
            } else if(contentStats.isDirectory()) {
                enqueue(path.join(nextDirectory, filename));
            }
        }
    }

    await breadthFirstSearch<string>(
        rootDir,
        visitor
    );
}

await traverseDirectoryTree(markdownDirectory);

