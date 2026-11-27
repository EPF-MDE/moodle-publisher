/** The driver's options, re-exported by `browser.ts` as its public type. */
export interface Options {
  readonly baseUrl: string;
  readonly courseId: string;
  readonly sessionStatePath: string;
  readonly runDir: string;
}
