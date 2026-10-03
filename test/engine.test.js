import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BaselineError, reproCommand, shakeout } from '../src/engine.js';
import { BUILTIN, validateCustom } from '../src/perturbations.js';
import { opts, tempDir } from './helpers.js';

const pick = (...ids) => BUILTIN.filter((p) => ids.includes(p.id));
const node = (code) => [process.execPath, '-e', code];

test('a stable command reports no sensitivity', async () => {
  const report = await shakeout(
    opts({ argv: node('process.exit(0)'), perturbations: pick('tz-utc', 'locale-c') }),
  );
  assert.equal(report.summary.sensitive, 0);
  assert.equal(report.summary.stable, 2);
});

test('detects a timezone assumption and confirms it', async () => {
  const code = `process.exit(new Date(2024, 5, 1, 12).toISOString().startsWith('2024-06-01') ? 0 : 1)`;
  const report = await shakeout(
    opts({ argv: node(code), perturbations: pick('tz-utc', 'tz-kiritimati'), confirm: 2 }),
  );
  const bad = report.findings.find((f) => f.id === 'tz-kiritimati');
  assert.equal(bad.status, 'sensitive');
  assert.deepEqual(bad.confirmation, { reproduced: 3, total: 3 });
  assert.equal(report.findings.find((f) => f.id === 'tz-utc').status, 'stable');
});

test('an intermittent failure is labelled flaky, not sensitive', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const counter = join(dir, 'count');
    writeFileSync(counter, '0');
    // passes in the baseline, fails exactly once afterwards
    const code = `const fs=require('fs');const n=+fs.readFileSync(${JSON.stringify(counter)},'utf8');fs.writeFileSync(${JSON.stringify(counter)},String(n+1));process.exit(n===1?1:0)`;
    const report = await shakeout(opts({ argv: node(code), perturbations: pick('tz-utc'), confirm: 2 }));
    assert.equal(report.findings[0].status, 'flaky');
    assert.equal(report.summary.sensitive, 0);
  } finally {
    cleanup();
  }
});

test('a failing baseline is a BaselineError in exit mode', async () => {
  await assert.rejects(
    shakeout(opts({ argv: node('process.exit(4)'), perturbations: pick('tz-utc') })),
    BaselineError,
  );
});

test('a missing command is a BaselineError', async () => {
  await assert.rejects(
    shakeout(opts({ argv: ['no-such-binary-xyz'], perturbations: pick('tz-utc') })),
    /could not start/,
  );
});

test('output mode flags environment-dependent output', async () => {
  const probe = validateCustom({ id: 'probe', env: { SHAKEOUT_PROBE: 'x' } });
  const argv = node(`console.log(process.env.SHAKEOUT_PROBE ?? 'none')`);
  const byOutput = await shakeout(opts({ argv, compare: 'output', perturbations: [probe] }));
  assert.equal(byOutput.findings[0].status, 'sensitive');
  assert.equal(byOutput.findings[0].kind, 'output');
  // the exit code never changes, so exit mode sees nothing
  const byExit = await shakeout(opts({ argv, compare: 'exit', perturbations: [probe] }));
  assert.equal(byExit.summary.sensitive, 0);
});

test('ignore patterns keep volatile output from causing differences', async () => {
  const code = `console.log('run id ' + Math.random().toString(36).slice(2))`;
  const noisy = await shakeout(
    opts({ argv: node(code), compare: 'output', perturbations: pick('tz-utc'), confirm: 0 }),
  );
  assert.equal(noisy.summary.sensitive, 1);
  const quiet = await shakeout(
    opts({ argv: node(code), compare: 'output', perturbations: pick('tz-utc'), ignore: [/run id \w+/g] }),
  );
  assert.equal(quiet.summary.sensitive, 0);
});

test('path perturbations run from a relocated copy that has the files but not .git', async () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(join(dir, 'marker.txt'), 'x');
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref');
    const code = `const fs=require('fs');console.log('marker='+fs.existsSync('marker.txt'),'git='+fs.existsSync('.git'))`;
    const report = await shakeout(
      opts({ cwd: dir, argv: node(code), perturbations: pick('path-spaces'), compare: 'output' }),
    );
    const f = report.findings[0];
    assert.equal(f.status, 'sensitive');
    assert.deepEqual(f.excerpt, ['marker=true git=false']);
  } finally {
    cleanup();
  }
});

test('a space-sensitive script is caught by path-spaces', async () => {
  const { dir, cleanup } = tempDir();
  try {
    writeFileSync(join(dir, 'run.sh'), '#!/bin/sh\nd=$(pwd)\ncd $d || exit 1\n');
    const report = await shakeout(
      opts({
        cwd: dir,
        argv: ['sh run.sh'],
        shell: true,
        perturbations: pick('path-spaces', 'path-unicode'),
      }),
    );
    assert.equal(report.findings.find((f) => f.id === 'path-spaces').status, 'sensitive');
    assert.equal(report.findings.find((f) => f.id === 'path-unicode').status, 'stable');
  } finally {
    cleanup();
  }
});

test('home-empty gives the command a fresh, existing, empty HOME', async () => {
  const code = `const fs=require('fs');const h=process.env.HOME;if(h.includes('home-empty'))process.exit(fs.readdirSync(h).length===0?5:6)`;
  const report = await shakeout(opts({ argv: node(code), perturbations: pick('home-empty') }));
  assert.equal(report.findings[0].status, 'sensitive');
  assert.equal(report.findings[0].code, 5);
});

test('scratch directories are removed unless --keep', async () => {
  const gone = await shakeout(opts({ argv: node('0'), perturbations: pick('tz-utc') }));
  assert.equal(gone.scratch, null);
  const kept = await shakeout(opts({ argv: node('0'), perturbations: pick('tz-utc'), keep: true }));
  assert.ok(kept.scratch && existsSync(kept.scratch));
});

test('reproCommand only offered for plain env changes', () => {
  const o = opts({ argv: ['npm', 'test'] });
  assert.equal(
    reproCommand(
      BUILTIN.find((p) => p.id === 'tz-kolkata'),
      o,
    ),
    'env TZ=Asia/Kolkata npm test',
  );
  assert.equal(
    reproCommand(
      BUILTIN.find((p) => p.id === 'path-spaces'),
      o,
    ),
    null,
  );
  assert.equal(
    reproCommand(
      BUILTIN.find((p) => p.id === 'locale-unset'),
      o,
    ),
    null,
  );
  assert.match(
    reproCommand(
      BUILTIN.find((p) => p.id === 'ci-off'),
      o,
    ),
    /^env -u CI -u GITHUB_ACTIONS/,
  );
  assert.match(
    reproCommand(
      BUILTIN.find((p) => p.id === 'tz-utc'),
      opts({ argv: ['make test'], shell: true }),
    ),
    /sh -c 'make test'$/,
  );
});
