import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { tempDir } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/shakeout.js', import.meta.url));
const DEMO = fileURLToPath(new URL('../examples/demo-app', import.meta.url));

function shakeout(args, cwd = DEMO, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

test('--help and --version', () => {
  assert.match(shakeout(['--help']).stdout, /Usage/);
  assert.match(shakeout(['--version']).stdout, /^\d+\.\d+\.\d+/);
});

test('--list shows the catalogue', () => {
  const r = shakeout(['--list']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /tz-kiritimati/);
  assert.match(r.stdout, /net-blackhole.*opt-in/);
});

test('no command is a usage error (exit 2)', () => {
  const r = shakeout([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no command given/);
});

test('unknown flag and unknown perturbation are usage errors', () => {
  assert.equal(shakeout(['--nope', '--', 'true']).status, 2);
  const r = shakeout(['--only', 'tz-mars', '--', 'true']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown perturbation/);
});

test('demo app: exit 1 and the expected perturbations are found (JSON)', () => {
  const r = shakeout(['--json', '--confirm', '1', '--', 'node', 'checks.js'], DEMO, { TZ: 'UTC' });
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.version, 1);
  const sensitive = report.findings
    .filter((f) => f.status === 'sensitive')
    .map((f) => f.id)
    .sort();
  assert.deepEqual(sensitive, [
    'home-empty',
    'locale-german',
    'locale-turkish',
    'tmpdir-spaces',
    'tz-kiritimati',
    'tz-los-angeles',
    'tz-pago-pago',
  ]);
  assert.ok(report.findings.every((f) => !('fullOutput' in f)));
});

test('--markdown renders a table and a reproduction command', () => {
  const r = shakeout(['--markdown', '--only', 'tz-los-angeles', '--', 'node', 'checks.js'], DEMO, {
    TZ: 'UTC',
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\| `tz-los-angeles` \| tz \|/);
  assert.match(r.stdout, /env TZ=America\/Los_Angeles node checks\.js/);
});

test('a stable command exits 0', () => {
  const r = shakeout(['--only', 'tz,ci', '--', process.execPath, '-e', '0']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No environment sensitivity found/);
});

test('a failing baseline exits 2 with an explanation', () => {
  const r = shakeout(['--only', 'tz-utc', '--', process.execPath, '-e', 'process.exit(1)']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /baseline failed/);
});

test('shakeout.json adds custom perturbations and is validated', () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(
      join(dir, 'shakeout.json'),
      JSON.stringify({ perturbations: [{ id: 'eu-region', env: { REGION: 'eu' }, hint: 'region matters' }] }),
    );
    const probe = `process.exit(process.env.REGION === 'eu' ? 9 : 0)`;
    const r = shakeout(['--json', '--only', 'eu-region', '--', process.execPath, '-e', probe], dir);
    assert.equal(r.status, 1, r.stderr);
    const f = JSON.parse(r.stdout).findings[0];
    assert.equal(f.id, 'eu-region');
    assert.equal(f.code, 9);
    assert.equal(f.hint, 'region matters');

    writeFileSync(join(dir, 'shakeout.json'), '{"bogus": 1}');
    const bad = shakeout(['--list'], dir);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /unknown key "bogus"/);
  } finally {
    cleanup();
  }
});

test('node_modules is linked into relocated checkouts', () => {
  const { dir, cleanup } = tempDir();
  try {
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1');
    const probe = `require('dep')`;
    const r = shakeout(['--only', 'path-spaces', '--', process.execPath, '-e', probe], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    cleanup();
  }
});
