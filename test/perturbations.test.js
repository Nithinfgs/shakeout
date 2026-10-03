import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN, select, validateCustom } from '../src/perturbations.js';

test('built-in ids are unique, kebab-case and documented', () => {
  const ids = BUILTIN.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of BUILTIN) {
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(p.hint.length > 20, `${p.id} needs a useful hint`);
    assert.ok(p.description.length > 0);
    assert.ok(p.env || p.unset || p.path || p.umask, `${p.id} must change something`);
  }
});

test('default selection excludes opt-in perturbations; --all includes them', () => {
  assert.ok(!select(BUILTIN).some((p) => p.optIn));
  assert.ok(select(BUILTIN, { all: true }).some((p) => p.id === 'net-blackhole'));
});

test('only / skip match ids and categories', () => {
  const tz = select(BUILTIN, { only: ['tz'] });
  assert.ok(tz.length >= 4 && tz.every((p) => p.category === 'tz'));
  const noTz = select(BUILTIN, { skip: ['tz', 'path-deep'] });
  assert.ok(noTz.every((p) => p.category !== 'tz' && p.id !== 'path-deep'));
  // an explicit --only can select an opt-in perturbation
  assert.deepEqual(
    select(BUILTIN, { only: ['net-blackhole'] }).map((p) => p.id),
    ['net-blackhole'],
  );
});

test('unknown names are rejected with a helpful error', () => {
  assert.throws(
    () => select(BUILTIN, { only: ['tz-nowhere'] }),
    /unknown perturbation or category "tz-nowhere"/,
  );
});

test('custom perturbations are validated', () => {
  assert.equal(validateCustom({ id: 'eu-region', env: { REGION: 'eu' } }).category, 'custom');
  assert.throws(() => validateCustom({ id: 'Bad Id', env: { A: '1' } }), /must match/);
  assert.throws(() => validateCustom({ id: 'tz-utc', env: { A: '1' } }), /collides/);
  assert.throws(() => validateCustom({ id: 'noop' }), /changes nothing/);
  assert.throws(() => validateCustom({ id: 'x', env: { A: 1 } }), /strings/);
  assert.throws(() => validateCustom({ id: 'x', path: '../escape' }), /relative/);
});
