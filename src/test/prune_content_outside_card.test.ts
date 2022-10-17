import {findLeft} from "../prune_content_outside_card.js";

describe('Content Prune Logic', () => {
   describe('findLeft', () => {
       const list = [1,2,3,4,5,6,6,7,8,9];
       const cmp = (target: number) => (v: number) => {
           return v < target ? -1 : 1;
       }

       it('exact match', () => {
           const target = 7;

           const idx = findLeft(
               0, list.length - 1, cmp(target), list
           );

           expect(idx).toEqual(7);
       });

       it('leftmost match', () => {
           let target = 6;

           const idx = findLeft(
               0, list.length - 1, cmp(target), list
           );

           expect(idx).toEqual(5);
       });
   });
});