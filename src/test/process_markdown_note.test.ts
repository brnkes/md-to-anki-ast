import {processMarkdownNote} from "../process_markdown_note.js";
import {mdTestInline} from "./samples/index.js";
import {mdTestWithHeading} from "./samples/index.js";

describe('Markdown Note Processor', () => {
    it('simple test case', async () => {
        const result = await processMarkdownNote(mdTestWithHeading);
    });
});