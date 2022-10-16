import {processMarkdownNote} from "../process_markdown_note.ts";
import {mdTestInline} from "./samples/index.ts";

Deno.test('Markdown Note Processor', async (t) => {
    await t.step('simple', async () => {
        const result = await processMarkdownNote(mdTestInline);
    });
});