import { parse } from "flags"
import * as path from "path";
import Denque from "denque";

import { processMarkdownNote } from "./process_markdown_note.ts";

const parsedArgs = parse(Deno.args);

const markdownDirectory = parsedArgs.mdDir || Deno.env.get('OBSIDIAN_VAULT_DIR');
if(!markdownDirectory) {
    throw new Error("Please specify an Obsidian Vault.");
}

async function readAndProcessFile(fileFullPath: string) {
    const markdownContent = await Deno.readTextFile(fileFullPath);
    await processMarkdownNote(markdownContent);
}

async function traverseDirectoryTree(rootDir: string) {
    const traversalQueue = new Denque([rootDir]);

    while(!traversalQueue.isEmpty()) {
        const nextDirectory = traversalQueue.shift() as string; // guaranteed by isEmpty
        for await(const content of Deno.readDir(nextDirectory)) {
            if(content.isFile) {
                const fileExtension = path.extname(content.name);

                if(fileExtension === '.md') {
                    const fileFullPath = path.join(nextDirectory,content.name);
                    // await readAndProcessFile(fileFullPath);
                }
            } else if(content.isDirectory) {
                traversalQueue.push(path.join(nextDirectory, content.name))
            }
        }
    }
}

await traverseDirectoryTree(markdownDirectory);

