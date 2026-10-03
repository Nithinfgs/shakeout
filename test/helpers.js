import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Create a temp dir and return it with a cleanup function. */
export function tempDir(prefix = 'shakeout-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Default engine options for tests. */
export function opts(overrides) {
  return {
    argv: ['true'],
    shell: false,
    cwd: process.cwd(),
    perturbations: [],
    compare: 'exit',
    timeoutMs: 20_000,
    confirm: 1,
    baselineRuns: 1,
    ignore: [],
    keep: false,
    ...overrides,
  };
}
