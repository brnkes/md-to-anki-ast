import * as path from "path";
import { promises as fs } from "fs";

const url = new URL(import.meta.url);
const thisFolder = path.dirname(url.pathname);

export const mdTestWithHeading = await fs.readFile(path.join(thisFolder, 'test_with_heading.md'), 'utf-8');

