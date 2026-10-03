#!/usr/bin/env node
// Runs shakeout against examples/demo-app with a throwaway HOME that contains an (empty) ~/.cache,
// and TZ=UTC. The demo's baseline needs both so it passes on any machine, including a fresh one.
// Extra arguments are passed to shakeout before `-- node checks.js`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string[]} args @returns {import('node:child_process').SpawnSyncReturns<string>} */
export function runDemo(args = []) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'shakeout-demo-home-')));
  mkdirSync(join(home, '.cache'));
  try {
    return spawnSync(process.execPath, [join(root, 'bin/shakeout.js'), ...args, '--', 'node', 'checks.js'], {
      cwd: join(root, 'examples/demo-app'),
      encoding: 'utf8',
      env: { ...process.env, HOME: home, TZ: 'UTC' },
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runDemo(process.argv.slice(2));
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  process.exitCode = r.status ?? 2;
}
