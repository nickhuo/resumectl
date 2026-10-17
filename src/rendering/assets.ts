import { join, resolve } from "node:path";

export const TEMPLATE_DIR = resolve(import.meta.dir, "../../template");
export const FONT_DIR = join(TEMPLATE_DIR, "fonts");
