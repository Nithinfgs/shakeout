import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEnv, runCommand } from '../src/runner.js';

const base = { cwd: process.cwd(), env: process.env, timeoutMs: 10_000, shell: false };

test('buildEnv sets, unsets and honours prefix globs', () => {
  const env = buildEnv({ A: '1', LC_ALL: 'x', LC_CTYPE: 'y', LANG: 'z', KEEP: 'k' }, { NEW: 'n' }, [
    'LC_*',
    'LANG',
  ]);
  assert.deepEqual(env, { A: '1', KEEP: 'k', NEW: 'n' });
});

test('captures output and exit code', async () => {
  const r = await runCommand({
    ...base,
    argv: [process.execPath, '-e', 'console.log("hi"); console.error("err"); process.exit(3)'],
  });
  assert.equal(r.code, 3);
  assert.match(r.output, /hi/);
  assert.match(r.output, /err/);
});

test('reports a spawn error instead of throwing', async () => {
  const r = await runCommand({ ...base, argv: ['definitely-not-a-real-command-xyz'] });
  assert.match(r.spawnError ?? '', /ENOENT/);
});

test('kills a hung process on timeout', async () => {
  const started = Date.now();
  const r = await runCommand({
    ...base,
    timeoutMs: 300,
    argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
  });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 5000);
});

test('shell mode runs a command string', async () => {
  const r = await runCommand({ ...base, shell: true, argv: ['echo one && echo two'] });
  assert.equal(r.code, 0);
  assert.match(r.output, /one\ntwo/);
});

test('umask is applied on POSIX', { skip: process.platform === 'win32' }, async () => {
  const r = await runCommand({ ...base, umask: '077', shell: true, argv: ['umask'] });
  assert.match(r.output, /0?077/);
});
