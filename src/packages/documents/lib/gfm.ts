// Implementation: private to the documents package.
//
// One markdown reader, shared. Rendering a document and listing the pictures it
// shows have to agree on what the document says — a second reader configured
// slightly differently would let a picture be rendered but not hashed.
import { Marked } from "marked";

/** GitHub-flavoured markdown: tables, fenced code, task lists. */
export const marked = new Marked({ gfm: true, breaks: false });
