import {processMarkdownNotes} from "../process_markdown_note.js";
import {mdTestWithHeading} from "./samples/index.js";

describe('Markdown Note Processor', () => {
    it('simple test case', async () => {
        const result = await processMarkdownNotes(mdTestWithHeading);

        expect(result.map(x => x.front)).toEqual([
            'Section A',
            'Section B',
            'Title C',
            'What is 5+5'
        ]);

        expect(result[3].id).toEqual("foobar");

        expect(result.map(x => x.back)).toMatchSnapshot();
    });
});