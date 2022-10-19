import remarkParse from 'remark-parse';
import {unified} from 'unified'
import remarkGfm from 'remark-gfm'
import {visit} from 'unist-util-visit';
import {is as isUnist} from 'unist-util-is';
import type {Node} from 'unist';
import type {Heading, HTML, Parent, Text} from 'mdast';
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
    lastIndex: number;
}

function findTitle(content: string): FindTitleResults | undefined {
    const rxPrefix = new RegExp(`^${CardHints.CardFront}\\s+(.+)$`, 'gm');
    const rxSuffix = new RegExp(`^(.+)\\s+${CardHints.CardFront}\\s*$`, 'gm');

    for(const rx of [rxPrefix, rxSuffix]) {
        const matches = rx.exec(content);

        const frontTitle = matches?.[1];
        if(frontTitle) {
            return {
                titleMatch: frontTitle,
                contentRemainder: content.slice(rx.lastIndex),
                lastIndex: rx.lastIndex
            };
        }
    }
}

function encounteredEndSymbol(content: string) {
    const rxPrefix = new RegExp(`^(${CardHints.CardBack})`,'gm');
    const rxSuffix = new RegExp(`^.+(\\s*${CardHints.CardBack})\\s?$`, 'gm');

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

type CardIDInjectionCandidate = {
    line: number,
    column: number
};

type ParseContentNextInput = {
    node: Node,
    parent: Parent | null,
    index: number | null
}

type ParseGenStateAfterTitleFound = FindTitleResults & {
    foundTitleParentIndex: number,
    placeToInjectIDContainer?: CardIDInjectionCandidate
}

export type CardResult = {
    front: string,
    back: string,
    type: string,
    placeToInjectIDContainer?: CardIDInjectionCandidate,
    _debug?: {
        backMarkdown?: string
    }
}

export type CardIdProps = {
    id: string | null;
    needsNewCardIDInjection: boolean;
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
                        foundTitleParentIndex: index+1,
                    }

                    if(node.position) {
                        foundTitle = {
                            ...foundTitle,
                            placeToInjectIDContainer: {
                                line: node.position?.start.line,
                                column: node.position?.start.column + results.lastIndex
                            }
                        }
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

        const { placeToInjectIDContainer } = foundTitle;

        const card: CardResult = {
            front: foundTitle.titleMatch,
            back: htmlOutput,
            type: 'basic',
            placeToInjectIDContainer,
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

const cardIdCommentRegex = new RegExp(`^<!--${CardHints.IdCommentIdentifier}\\s([\\w\\d]+).+$`, 'm');

function checkCardIdentifier(node: Node) {
    if(isUnist<HTML>(node, 'html')) {
        const matches = cardIdCommentRegex.exec(node.value);
        if(matches?.[1]) {
            return matches[1];
        }
    }

    return null;
}

export const getContentParser = () => {
    let hierarchicalId = 1;
    const hierarchicalIdGen = () => hierarchicalId++;

    let lastCardId: string | null = null;

    return {
        mainContentParser: genParseContent(),
        cardIdChecker: {
            tryCheckAndMemorize: (n: Node) => {
                lastCardId = lastCardId || checkCardIdentifier(n);
            },
            get: () => lastCardId,
            reset: () => {
                lastCardId = null;
            }
        },
        hierarchicalIdGen
    }
}

export async function processMarkdownNotes(content: string) {
    const mdTree = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .parse(content);

    const contentParser = getContentParser();
    contentParser.mainContentParser.next();

    const cardsDetected: (CardResult & CardIdProps)[] = [];

    (visit as any)(mdTree, (node: Node & WithId, index: number | null, parent: (Parent & WithId) | null) => {
        const idGen = contentParser.hierarchicalIdGen;
        node._id = [...parent?._id || [], idGen()];

        const intent = contentParser.mainContentParser.next({ node, index, parent });
        contentParser.cardIdChecker.tryCheckAndMemorize(node);

        switch(intent.value?.request) {
            case ParserSteps.RelayToVisitor:
                return intent.value?.value;
            case ParserSteps.CreatedCard:
                const cardDetails = intent.value?.value;
                const idFound = contentParser.cardIdChecker.get();
                const needsNewCardIDInjection = idFound === null;

                cardsDetected.push({ ...cardDetails, id: idFound, needsNewCardIDInjection });
                contentParser.cardIdChecker.reset();
                break;
        }
    });

    return cardsDetected;
}