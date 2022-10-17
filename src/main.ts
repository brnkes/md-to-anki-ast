import * as path from "path";
import { promises as fs } from "fs";
import Denque from "denque";

import { processMarkdownNote } from './process_markdown_note.js';

const markdownDirectory = process.env['OBSIDIAN_VAULT_DIR'];
if(!markdownDirectory) {
    throw new Error("Please specify an Obsidian Vault.");
}

async function readAndProcessFile(fileFullPath: string) {
    const markdownContent = await fs.readFile(fileFullPath, 'utf-8');
    await processMarkdownNote(markdownContent);
}

async function traverseDirectoryTree(rootDir: string) {
    const traversalQueue = new Denque([rootDir]);

    while(!traversalQueue.isEmpty()) {
        const nextDirectory = traversalQueue.shift() as string; // guaranteed by isEmpty
        for (const filename of await fs.readdir(nextDirectory)) {
            const contentStats = await fs.lstat(filename);
            if(contentStats.isFile()) {
                const fileExtension = path.extname(filename);

                if(fileExtension === '.md') {
                    const fileFullPath = path.join(nextDirectory, filename);
                    // await readAndProcessFile(fileFullPath);
                }
            } else if(contentStats.isDirectory()) {
                traversalQueue.push(path.join(nextDirectory, filename))
            }
        }
    }
}

await traverseDirectoryTree(markdownDirectory);

