import {processMarkdownNotes} from "../process_markdown_note.js";
import {mdTestWithHeading} from "./samples/index.js";

describe('Markdown Note Processor', () => {
    it('simple test case', async () => {
        const result = await processMarkdownNotes(mdTestWithHeading);

        expect(result.map(x => x.front)).toEqual([
            'Section A',
            'Section B',
            'What is 5+5'
        ]);
    });
});