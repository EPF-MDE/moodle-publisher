// Implementation: private to the documents package, exposed through its entry
// point because a Deliverable is hashed the same way a document is.
import { createHash } from "node:crypto";

/** What a hash can be taken over: text, or the bytes of a file. */
export type HashedPart = string | Buffer;

/**
 * What `parts` hash to, spelled the way every hash this program writes down is
 * spelled: one algorithm, named in the value, so a manifest written today
 * still says what its hashes are if this ever changes.
 *
 * The prefix is not the caller's to spell. Every hash the manifest holds is
 * compared against one taken by a later run, so an algorithm named in one
 * place and computed in another is a comparison that can go on succeeding
 * while the two halves have drifted apart.
 *
 * The parts are hashed in the order they are given, with nothing inserted
 * between them: what separates one from the next is the caller's business,
 * because it is the caller that knows which two of them could otherwise run
 * together into a different reading of the same bytes.
 */
export function contentHash(parts: readonly HashedPart[]): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return `sha256:${digest.digest("hex")}`;
}
