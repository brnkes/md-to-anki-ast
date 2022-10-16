import * as path from "path";
const url = new URL(import.meta.url);
const thisFolder = path.dirname(url.pathname);

export const mdTestInline = await Deno.readTextFile(path.join(thisFolder, 'test_inline.md'));
