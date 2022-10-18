import remarkParse from 'remark-parse';
import {unified} from 'unified'
import remarkGfm from 'remark-gfm'
import {visit} from 'unist-util-visit';
import {is as isUnist} from 'unist-util-is';
import type {Node} from 'unist';
import type {Heading, Parent, Text} from 'mdast';
import {text as textMD} from 'mdast-builder';
import {gatherSubcontentTree, markContentBoundaries, WithId} from './prune_content_outside_card.js';
import {assertDefined} from "./shared.js";
import {toHast} from 'mdast-util-to-hast'
import {toHtml} from 'hast-util-to-html'
import {toMarkdown} from "mdast-util-to-markdown";

enum CardHints {
    CardFront = "❔",
    CardBack = "📓"
}

type FindTitleResults = {
    titleMatch: string;
    contentRemainder: string;
}
// new RegExp("^(.+)+\s+❔$",'gm')
function findTitle(content: string): FindTitleResults | undefined {
    const basis = "Section C - should not be included in the card";

    const ss = content === basis;
    console.log(ss);

    const rxPrefixed = new RegExp(`^(.+)+\\s+${CardHints.CardFront}$`, 'gm');
    const rxSuffixed = new RegExp(`^${CardHints.CardFront}\\s+(.+)$`, 'gm');

    const rerer = rxPrefixed.exec(content);

    for(const rx of [rxPrefixed, rxSuffixed]) {
        const matches = rx.exec(content);

        const frontTitle = matches?.[1];
        if(frontTitle) {
            return {
                titleMatch: frontTitle,
                contentRemainder: content.slice(rx.lastIndex)
            };
        }
    }
}

function encounteredEndSymbol(content: string) {
    const rx = new RegExp(`^${CardHints.CardBack}`,'gm');

    const matches = rx.exec(content);

    if(matches) {
        return {
            contentUntilEndToken: content.slice(0, matches.index),
            contentRemainder: content.slice(rx.lastIndex)
        }
    }
}

enum ParserSteps {
    RelayToVisitor,
    CreatedCard
}

type ParseGenYield = undefined | {
    request: ParserSteps.RelayToVisitor,
    value: number
} | {
    request: ParserSteps.CreatedCard,
    value: CardResult
}

type CardResult = {
    front: string,
    back: string,
    type: string,
    id: string,
    _debug?: {
        backMarkdown?: string
    }
}

type ParseContentNextInput = {
    node: Node,
    parent: Parent | null,
    index: number | null
}

type ParseGenStateAfterTitleFound = FindTitleResults & {
    foundTitleParentIndex: number
}

export const getContentParser = () => {
    let id = 1;
    const idGen = () => id++;

    return {
        parserObject: genParseContent(),
        idGen
    }
}

function* genParseContent(): Generator<ParseGenYield, void, ParseContentNextInput> {
    while(true) {
        // Search for a title
        let foundTitle: ParseGenStateAfterTitleFound | undefined;
        while (!foundTitle) {
            const { node, index, parent } = yield;

            if(isUnist<Text>(node, 'text')) {
                const results = findTitle(node.value);

                if(results) {
                    assertDefined(parent);
                    assertDefined(index);

                    // can't think of a case where it matters whether we preserve the token... ?
                    parent.children = [
                        ...parent.children.slice(0, index - 1),
                        textMD(results.titleMatch) as any,
                        textMD(results.contentRemainder) as any,
                        ...parent.children.slice(index + 1)
                    ];

                    foundTitle = {
                        ...results,
                        foundTitleParentIndex: index+1
                    }
                }
            }
        }

        // Keep accumulating content until card end symbol is found
        let buffer: (Parent & WithId)[] = [];

        const adjustTraversalRequest: ParseGenYield = {
            request: ParserSteps.RelayToVisitor,
            value: foundTitle.foundTitleParentIndex
        }

        // Keep looping until a new heading or end-of-note token is found.
        let node = (yield adjustTraversalRequest).node;
        while (true) {
            const isHeading = isUnist<Heading>(node, 'heading');

            if(isHeading) {
                break;
            }

            if(isUnist<Text>(node, 'text')) {
                const shouldStop = encounteredEndSymbol(node.value);

                if(shouldStop) {
                    break;
                }
            }

            // todo: proper typing
            buffer.push(node as any);
            node = (yield).node;
        }

        markContentBoundaries(buffer);
        const subcontentRoot = gatherSubcontentTree(buffer);

        const htmlAST = toHast(subcontentRoot);
        if(!htmlAST) {
            throw new Error("HAST failure");
        }
        const htmlOutput = toHtml(htmlAST);

        const card: CardResult = {
            front: foundTitle.titleMatch,
            back: htmlOutput,
            type: 'basic',
            id: 'todo',
            _debug: {
                backMarkdown: toMarkdown(subcontentRoot)
            }
        };

        yield {
            request: ParserSteps.CreatedCard,
            value: card
        }
    }
}

export async function processMarkdownNotes(content: string) {
    const mdTree = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(content);

    const contentParser = getContentParser();
    contentParser.parserObject.next();

    const cardsFound: CardResult[] = [];

    (visit as any)(mdTree, (node: Node & WithId, index: number | null, parent: (Parent & WithId) | null) => {
        const idGen = contentParser.idGen;
        node._id = [...parent?._id || [], idGen()];

        const intent = contentParser.parserObject.next({ node, index, parent });

        switch(intent.value?.request) {
            case ParserSteps.RelayToVisitor:
                return intent.value?.value;
            case ParserSteps.CreatedCard:
                cardsFound.push(intent.value?.value);
                break;
        }
    });

    return cardsFound;
}