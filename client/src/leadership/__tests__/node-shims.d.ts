/**
 * Minimal ambient declarations for the Node built-ins used by the structural
 * isolation test (`isolation.test.ts`).
 *
 * The client project targets the browser and intentionally does not depend on
 * `@types/node`. This file is a global (non-module) declaration script — it has
 * no top-level `import`/`export` — so the `declare module` blocks below are
 * treated as ambient module declarations rather than augmentations, which lets
 * the isolation test import a tiny, typed slice of `node:fs`/`node:path` while
 * keeping `tsc --noEmit` clean and adding no runtime dependency.
 */

declare const process: { cwd(): string };

declare module 'node:fs' {
  export function readFileSync(p: string, encoding: string): string;
  export function existsSync(p: string): boolean;
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
  export function join(...segments: string[]): string;
  export function dirname(p: string): string;
  export const sep: string;
}
