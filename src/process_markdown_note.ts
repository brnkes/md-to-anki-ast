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

function findTitle(content: string): FindTitleResults | undefined {
    const rxPrefixed = new RegExp(`^(.+)+\\s+${CardHints.CardFront}$`, 'gm');
    const rxSuffixed = new RegExp(`^${CardHints.CardFront}\\s+(.+)$`, 'gm');

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
    RelayToVisitor
}

type ParseGenYield = undefined | {
    request: ParserSteps.RelayToVisitor,
    value: number
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
                    console.log(index);

                    assertDefined(parent);
                    assertDefined(index);

                    // todo: Preserve content more accurately... or does it even matter ?
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

        let adjustTraversal: ParseGenYield = {
            request: ParserSteps.RelayToVisitor,
            value: foundTitle.foundTitleParentIndex
        }

        let node = (yield adjustTraversal).node;

        while (true) {
            const isHeading = isUnist<Heading>(node, 'heading');

            if(isHeading) {
                // todo: construct and re traverse
                break;
            }

            if(isUnist<Text>(node, 'text')) {
                const shouldStop = encounteredEndSymbol(node.value);

                if(shouldStop) {
                    // todo: construct and re traverse
                    break;
                }
            }

            // todo: proper typing
            buffer.push(node as any);
            node = (yield).node;
        }

        markContentBoundaries(buffer);
        const subcontentRoot = gatherSubcontentTree(buffer);

        const backToMarkdown = toMarkdown(subcontentRoot);

        const htmlAST = toHast(subcontentRoot);

        if(!htmlAST) {
            throw new Error("HAST failure");
        }

        const htmlOutput = toHtml(htmlAST);

        const card = {
            front: foundTitle.titleMatch,
            back: htmlOutput,
            type: 'basic'
        };

        console.log(card);
    }
}

export async function processMarkdownNote(content: string) {
    const mdTree = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(content);

    const contentParser = getContentParser();
    contentParser.parserObject.next();

    (visit as any)(mdTree, (node: Node & WithId, index: number | null, parent: (Parent & WithId) | null) => {
        const idGen = contentParser.idGen;
        node._id = [...parent?._id || [], idGen()];

        const intent = contentParser.parserObject.next({ node, index, parent });

        if(intent.value?.request === ParserSteps.RelayToVisitor) {
            return intent.value?.value;
        }
    });

    return mdTree;
}