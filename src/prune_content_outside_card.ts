import {Parent, Root} from "mdast";
import {assertDefined} from "./shared.js";
import {root} from "mdast-builder";
import {getAncestorTrie} from "./common/ancestor_trie.js";
import {visit} from "unist-util-visit";

export type WithId = {
    _id: number[];
}

export function findLeft<T>(lo: number, hi: number, comparisonFn: (val: T) => number, list: T[]) {
    while(lo < hi) {
        const mid = lo + (hi - lo) / 2 | 0;

        const comparison = comparisonFn(list[mid])
        if(comparison < 0) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

export const compareVectors = (target: number[]) => (other: number[]) => {
    /*if((target[0] === 9 && target[1] === 1) || target[0] === 1) {
        debugger;
    }*/

    for(const ee of target.entries()) {
        const [idx, targetVal] = ee;

        const otherVal = other[idx];

        // ex: Target : [A,b,II,X] || Other : [A,b]
        if (other[idx] === undefined) {
            return -1
        }

        //
        if(otherVal > targetVal) {
            return 1
        } else if(otherVal < targetVal) {
            return -1
        }
    }

    // ex: Target : [A,b,II,X] || Other : [A,b,II,X,q]
    if(other.length > target.length) {
        return 1;
    }

    return 0
}

const searchNearestVector = (startFrom: number, buffer: WithId[]) => {
    const hi = startFrom;
    const lo = 0;

    const [_idCurrent, ...idAncestors] = [...buffer[startFrom]._id].reverse();
    const target = [...idAncestors].reverse();

    if(target.length === 0) {
        return
    }

    const cmp = compareVectors(target);
    const result = findLeft(lo, hi,(v) => cmp(v._id), buffer);

    /*
        We might have no more ancestors left.
        Ex: Target : [1] || Result of findLeft : [1,4,6]
    */
    if(result === 0) {
        const comparisonResult = cmp(buffer[result]._id);
        if(comparisonResult > 0) {
            return;
        }
    }

    return result;
}

export const markContentBoundaries = (
    buffer: (Parent & WithId)[]
) => {
    let lastIdx = buffer.length - 1;

    while(true) {
        const idxAncestor = searchNearestVector(lastIdx, buffer);

        if(idxAncestor === undefined) {
            break;
        }

        assertDefined(idxAncestor);

        lastIdx = idxAncestor
    }
}

export const findInclusiveIndexToPruneChildrenFrom = (elem: Parent) => {
    // todo: types
    const typedChildren = elem.children as any[] as (Node & Partial<WithId>)[];

    return findLeft(
        0, typedChildren.length,
        (other) => {
            return other._id ? -1 : 1;
        },
        typedChildren
    );
}

const markVisitedSubtrees = (
    trie: ReturnType<typeof getAncestorTrie>,
    ancestorNode: WithId & Parent,
    newContentRoot: Root
) => {
    const visitor = async (
        elem: WithId & Partial<Parent>,
        index: number,
        parent: WithId & Parent
    ) => {
        if(elem._id?.length === undefined) {
            console.warn("Un-ID'd nodes should have been pruned ?");
            return;
        }

        trie.add(elem._id);

        // Should prune out-of-bounds children.
        if(elem.children !== undefined) {
            const cutoffIdxIncl = findInclusiveIndexToPruneChildrenFrom(elem as Parent);
            if (elem.children.length > cutoffIdxIncl) {
                if (parent) {
                    const elemCpy = JSON.parse(JSON.stringify(elem));
                    elemCpy.children = elemCpy.children.slice(0, cutoffIdxIncl);
                    parent.children[index] = elemCpy;
                } else {
                    elem.children = elem.children.slice(0, cutoffIdxIncl);
                }
            }
        }
    }

    // Trie will contain this element if it's a child of a previously processed element.
    const skip = trie.exists(ancestorNode._id);
    if(skip) {
        return;
    }

    visit(ancestorNode, visitor as any)
    newContentRoot.children.push(ancestorNode as any);
}

export const createPrunedSubcontentTree = (
    buffer: (Parent & WithId)[]
) => {
    const trieRoot = getAncestorTrie();
    const fauxRoot = root() as Root;

    for(const elem of buffer) {
        markVisitedSubtrees(trieRoot, elem, fauxRoot);
    }

    // console.log(trieRoot.debugPrint());

    return fauxRoot;
}