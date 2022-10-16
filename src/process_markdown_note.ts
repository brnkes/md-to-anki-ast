import remarkParse from 'remark-parse';
import {unified} from 'https://esm.sh/unified@10';
import remarkGfm from 'https://esm.sh/remark-gfm@3';
import {visit} from "https://esm.sh/unist-util-visit@4"

enum CardHints {
    CardFront = "❔",
    CardBack = "📓"
}

function trySingleLineFrontPrefixed(content: string) {
    const matches = content.match(`^\S+\s+${CardHints.CardFront}$`);
}

function trySingleLineFrontSuffixed(content: string) {
    const matches = content.match(`^${CardHints.CardFront}\s+\S+$`);
}

export async function processMarkdownNote(content: string) {
    const mdTree = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(content);

    await visit(mdTree, 'text', (textSection) => {
        const textValue = textSection.value;

        const a = trySingleLineFrontPrefixed(textValue);
        const b = trySingleLineFrontSuffixed(textValue);

        console.log(a,b);
    });

    return mdTree;
}