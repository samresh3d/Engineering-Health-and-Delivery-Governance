/**
 * Module-isolation static/smoke checks (task 17.1).
 *
 * This is a *structural* test rather than a runtime one: it scans the
 * data-management source files on disk (via Node's `fs`) and asserts the
 * invariants that keep this feature contained inside the isolated Leadership
 * module. It deliberately avoids git or the network so it is deterministic and
 * runnable in any CI sandbox.
 *
 * When run under Vitest the working directory (`process.cwd()`) is the
 * `client/` folder, so every path here is resolved relative to
 * `client/src/leadership`.
 *
 * Covers:
 *  - Req 11.1 — the Data Management page and its files reside within the
 *    isolated Leadership module directory (`src/leadership`).
 *  - Req 11.2 — the module operates without a backend service or network API:
 *    the data-management sources contain no network/backend call sites.
 *  - Req 11.6 — the feature does not reach into (import from) the Engineering
 *    Health Dashboard: no data-management source imports escape the Leadership
 *    module directory or reference the health-dashboard modules by path.
 */
// The client tsconfig targets the browser and does not include `@types/node`,
// yet this structural test legitimately runs in Vitest's Node environment. The
// minimal Node API surface used below is declared in the sibling ambient
// `node-shims.d.ts` so `tsc --noEmit` stays clean without adding a dependency.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Absolute path to the isolated Leadership module. `process.cwd()` is the
 * `client/` folder when Vitest runs, so the module lives at `src/leadership`.
 */
const MODULE_ROOT = path.resolve(process.cwd(), 'src', 'leadership');

/**
 * Source files that make up the Leadership Data Management feature, expressed
 * relative to {@link MODULE_ROOT}. These are the files the feature introduced
 * or extended; the isolation invariants below apply to all of them.
 */
const DATA_MANAGEMENT_SOURCES: readonly string[] = [
  // Editing model + shared types
  'model/editing-types.ts',
  // Pure computation-core services
  'services/grid-projector.ts',
  'services/validator.ts',
  'services/indicator-service.ts',
  'services/change-tracker.ts',
  'services/approval-service.ts',
  'services/edit-history.ts',
  'services/import-service.ts',
  'services/csv-export.ts',
  'services/persistence-service.ts',
  'services/grid-filter.ts',
  // State layer (existing files extended by this feature)
  'state/LeadershipContext.ts',
  'state/LeadershipProvider.tsx',
  // View layer
  'components/DataManagementView.tsx',
  'components/DataGrid.tsx',
  'components/GridFilterBar.tsx',
  'components/AuditTrailPanel.tsx',
  'components/VersionPanel.tsx',
  'components/ImportExportControls.tsx',
  'components/IdentityPrompt.tsx',
];

/** Read a data-management source file (relative to the module root). */
function readSource(relPath: string): string {
  return readFileSync(path.join(MODULE_ROOT, relPath), 'utf8');
}

/**
 * Extract the module specifiers from every `import ... from '...'` and bare
 * `import '...'` statement in a source file. Keeps the check simple and
 * robust: we only care about the quoted specifier, not the imported bindings.
 */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  // `import ... from 'x'` / `export ... from 'x'`
  const fromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
  // side-effect imports: `import 'x'`
  const bareRe = /\bimport\s+['"]([^'"]+)['"]/g;
  for (const re of [fromRe, bareRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

describe('Leadership Data Management module isolation', () => {
  it('places every data-management source under src/leadership (Req 11.1)', () => {
    for (const relPath of DATA_MANAGEMENT_SOURCES) {
      const abs = path.join(MODULE_ROOT, relPath);
      expect(existsSync(abs), `expected ${relPath} to exist under src/leadership`).toBe(true);
      // Defensive: the resolved path must live inside the module directory.
      expect(abs.startsWith(MODULE_ROOT + path.sep)).toBe(true);
    }
  });

  it('makes no network/backend calls from data-management sources (Req 11.2)', () => {
    // Backend/network call sites that would break the "no backend" constraint.
    // We assert the substrings are absent from the source text. `http://` /
    // `https://` are intentionally NOT included: URLs can legitimately appear
    // in doc comments (e.g. RFC references) without implying a runtime call,
    // so we key on the actual call-site tokens instead, which is both
    // meaningful and non-brittle.
    const forbidden = ['fetch(', 'axios', 'XMLHttpRequest', 'WebSocket'];
    for (const relPath of DATA_MANAGEMENT_SOURCES) {
      const source = readSource(relPath);
      for (const token of forbidden) {
        expect(
          source.includes(token),
          `${relPath} must not contain a network/backend call site: "${token}"`
        ).toBe(false);
      }
    }
  });

  it('never imports outside the Leadership module or the Engineering Health Dashboard (Req 11.6)', () => {
    for (const relPath of DATA_MANAGEMENT_SOURCES) {
      const source = readSource(relPath);
      const fileDir = path.dirname(path.join(MODULE_ROOT, relPath));

      for (const spec of importSpecifiers(source)) {
        // Non-relative specifiers are external packages (react, ag-grid, …) or
        // ambient CSS — none of which reach the Engineering Health Dashboard.
        if (!spec.startsWith('.')) continue;

        // A relative import must resolve to a path that stays within the
        // isolated module. Anything that escapes `src/leadership` would couple
        // this feature to code outside the module (e.g. the Engineering Health
        // Dashboard), violating Req 11.6.
        const resolved = path.resolve(fileDir, spec);
        expect(
          resolved === MODULE_ROOT || resolved.startsWith(MODULE_ROOT + path.sep),
          `${relPath} imports "${spec}" which escapes the Leadership module`
        ).toBe(true);

        // Narrow, explicit guard: no data-management source may reference the
        // Engineering Health Dashboard modules by path.
        const lowered = spec.toLowerCase();
        expect(
          lowered.includes('engineering-health') || lowered.includes('health-dashboard'),
          `${relPath} must not import Engineering Health Dashboard code ("${spec}")`
        ).toBe(false);
      }
    }
  });
});
