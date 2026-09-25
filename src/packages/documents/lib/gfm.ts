// Implementation: private to the documents package.
//
// One markdown reader, shared. Rendering a document and listing the pictures it
// shows have to agree on what the document says — a second reader configured
// slightly differently would let a picture be rendered but not hashed.
import { Marked } from "marked";

import type { Token, TokenizerAndRendererExtension, Tokens } from "marked";

/**
 * `owner/repo#97`, at the start of what is left to read: the owner in group 1,
 * the repository in group 2, the number in group 3. Owners are letters, digits
 * and hyphens on GitHub; a repository may also have dots and underscores.
 */
const REFERENCE =
  /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)#(\d+)(?![\w#])/;

/**
 * The same, anywhere, and not in the middle of a longer word or path:
 * `a/b/c#3` is the end of a path, not a reference to the repository `b/c`.
 */
const REFERENCE_ANYWHERE =
  /(?<![\w./#-])[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+#\d+(?![\w#])/;

/** Where an issue number lands on GitHub, which redirects a pull request's. */
function issueUrl(token: Tokens.Generic): string {
  return `https://github.com/${token["owner"]}/${token["repo"]}/issues/${token["number"]}`;
}

/**
 * GitHub's cross-repository reference, `EPF-MDE/OceENS#97`, as a link to it.
 *
 * GitHub links it on its own pages, and an author writing on GitHub never sees
 * that it is not markdown: published anywhere else it is plain text. Only the
 * form naming its repository is linked. `#97` alone takes its repository from
 * the page it is on, and a published document is on none.
 *
 * Inside a link's text it stays text, since the link already goes somewhere,
 * and a code span is never read for it at all.
 */
const githubReference: TokenizerAndRendererExtension = {
  name: "githubReference",
  level: "inline",
  start(src: string): number | undefined {
    return REFERENCE_ANYWHERE.exec(src)?.index;
  },
  tokenizer(src: string, tokens: Token[]): Tokens.Generic | undefined {
    if (this.lexer.state.inLink) return undefined;
    // What was read just before is not in `src`, so the check `start` makes
    // with a lookbehind is made here against the token before.
    if (/[\w./#-]$/.test(tokens.at(-1)?.raw ?? "")) return undefined;
    const match = REFERENCE.exec(src);
    if (match === null) return undefined;
    const [raw, owner, repo, number] = match;
    return { type: "githubReference", raw, owner, repo, number };
  },
  renderer(token: Tokens.Generic): string {
    return `<a href="${issueUrl(token)}">${token.raw}</a>`;
  },
};

/** GitHub-flavoured markdown: tables, fenced code, task lists. */
export const marked = new Marked(
  { gfm: true, breaks: false },
  { extensions: [githubReference] }
);

/**
 * Whether `markdown` makes any GitHub reference the reader links, which changes
 * the page published for it.
 */
export function makesGitHubReferences(markdown: string): boolean {
  let found = false;
  marked.walkTokens(marked.lexer(markdown), (token: Token) => {
    if (token.type === "githubReference") found = true;
  });
  return found;
}
