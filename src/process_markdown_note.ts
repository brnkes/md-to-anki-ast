import remarkParse from 'remark-parse';
import {unified} from 'unified'
import remarkGfm from 'remark-gfm'
import {visit} from 'unist-util-visit';
import {is as isUnist} from 'unist-util-is';
import type {Node} from 'unist';
import type {Heading, Parent, Text} from 'mdast';
import {text as textMD} from 'mdast-builder';
import {createPrunedSubcontentTree, markContentBoundaries, WithId} from './prune_content_outside_card.js';
import {assertDefined} from "./shared.js";
import {toHast} from 'mdast-util-to-hast'
import {toHtml} from 'hast-util-to-html'
import {toMarkdown} from "mdast-util-to-markdown";

enum CardHints {
    CardFront = "❔",
    CardBack = "📓",
    IdCommentIdentifier = "🔮"
}

type FindTitleResults = {
    titleMatch: string;
    contentRemainder: string;
}

function findTitle(content: string): FindTitleResults | undefined {
    const rxPrefix = new RegExp(`^(.+)\\s+${CardHints.CardFront}$`, 'gm');
    const rxSuffix = new RegExp(`^${CardHints.CardFront}\\s+(.+)$`, 'gm');

    for(const rx of [rxPrefix, rxSuffix]) {
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
    const rxPrefix = new RegExp(`^(${CardHints.CardBack})`,'gm');
    const rxSuffix = new RegExp(`^.+(\\s*${CardHints.CardBack})$`, 'gm');

    for(const rx of [rxPrefix, rxSuffix]) {
        const matches = rx.exec(content);

        if (matches) {
            return {
                contentUntilEndToken: content.slice(0, rx.lastIndex - matches[1].length),
                contentRemainder: content.slice(rx.lastIndex)
            }
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

const injectIntoArray = <T>(arr: T[], index: number, elementsToInject: T[]) => {
    return [
        ...arr.slice(0, index),
        ...elementsToInject,
        ...arr.slice(index + 1)
    ];
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
                    parent.children = injectIntoArray(
                        parent.children,
                        index,
                        [
                            textMD(results.titleMatch) as any,
                            textMD(results.contentRemainder) as any,
                        ]
                    );

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
        let { node, parent, index } = (yield adjustTraversalRequest);
        while (true) {
            const isHeading = isUnist<Heading>(node, 'heading');

            if(isHeading) {
                // No need to update the buffer, heading is out of bounds.
                break;
            }

            if(isUnist<Text>(node, 'text')) {
                const shouldStop = encounteredEndSymbol(node.value);

                if(shouldStop) {
                    assertDefined(parent);
                    assertDefined(index);

                    // We have to include content up to the end token.
                    parent.children = injectIntoArray(
                        parent.children,
                        index,
                        [
                            textMD(shouldStop.contentUntilEndToken) as any,
                            textMD(shouldStop.contentRemainder) as any,
                        ]
                    );

                    // Re-traverse `contentUntilEndToken` so that visitor can attach an _id.
                    // Then, push it into the buffer.
                    const reprocessedContent = yield {
                        request: ParserSteps.RelayToVisitor,
                        value: index
                    };

                    node = reprocessedContent.node;

                    // todo: proper typing
                    buffer.push(node as any);
                    break;
                }
            }

            // todo: proper typing
            buffer.push(node as any);

            const nextContent = yield;
            node = nextContent.node;
            parent = nextContent.parent;
            index = nextContent.index;
        }

        markContentBoundaries(buffer);
        const subcontentRoot = createPrunedSubcontentTree(buffer);

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