import {Parent, Root} from "mdast";
import {assertDefined} from "./shared.js";
import {root} from "mdast-builder";

export type WithId = {
    _id: number[];
}

export type WithChildrenCutoff = {
    _childrenCutoff?: number
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

export const pruneUntaggedItems = (elem: Parent) => {
    // tood: types
    const typedChildren = elem.children as any[] as (Node & Partial<WithId>)[];

    const cutoffIdx = findLeft(
        0, typedChildren.length,
        (other) => {
            return other._id ? -1 : 1;
        },
        typedChildren
    );

    // todo: types
    (elem as any)._childrenCutoff  = cutoffIdx;
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

        pruneUntaggedItems(buffer[idxAncestor]);

        lastIdx = idxAncestor
    }
}

const getAncestorTrie = () => {
    const root: any = {}

    function add(ids: number[]) {
        let current = root;
        for(const id of ids) {
            current[id] = current[id] || {};
            current = current[id];
        }
    }

    function exists(v: number[]) {
        let current = root;
        for(const vD of v) {
            if(!current[vD]) {
                return false;
            }

            current = current[vD];
        }

        return true;
    }

    function debugPrint() {
        const buf: string[] = [];
        function go(tabs = 0, current = root) {
            for (const e of Object.entries(current)) {
                const log = `${[...Array(tabs)].map(() => "-").join("")}${e[0]}`;
                buf.push(log);

                go(tabs + 1, e[1]);
            }
        }

        go();
        return buf.join("\n");
    }

    return {
        add,
        exists,
        debugPrint
    }
}

export const gatherSubcontentTree = (
    buffer: (Parent & WithId & WithChildrenCutoff)[]
) => {
    const trieRoot = getAncestorTrie();
    const fauxRoot = root() as Root;

    let lastElemDepth = 9999999;

    for(const elem of buffer) {
        const skip = trieRoot.exists(elem._id);

        if(skip) {
            continue;
        }

        trieRoot.add(elem._id);

        const elemCpy = JSON.parse(JSON.stringify(elem));

        if(elemCpy._childrenCutoff) {
            if(elemCpy.children.length > elemCpy._childrenCutoff) {
                // const newChildren = [...elem.children].slice(0, elem._childrenCutoff);
                //
                // const elemCpy = { ...elem }
                // elemCpy.children = elemCpy;

                elemCpy.children = elemCpy.children.slice(0, elemCpy._childrenCutoff);
            }
        }

        fauxRoot.children.push(elemCpy as any);
    }

    console.log(trieRoot.debugPrint());

    return fauxRoot;
}