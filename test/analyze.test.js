import assert from 'node:assert/strict';
import { test } from 'node:test';
import { difference, excerpt, normalize } from '../src/analyze.js';

const run = (o) => ({
  code: 0,
  signal: null,
  output: '',
  durationMs: 1,
  timedOut: false,
  spawnError: null,
  truncated: false,
  ...o,
});

test('normalize strips colour and masks paths, timestamps and durations', () => {
  const text = '\u001b[31mfailed\u001b[0m in /tmp/work/a 12ms at 2024-03-01T10:20:30Z\r\n';
  assert.equal(normalize(text, { paths: ['/tmp/work'] }), 'failed in <PATH>/a <T> at <TS>');
});

test('normalize masks the longest path first', () => {
  assert.equal(normalize('/a/b/c and /a/b', { paths: ['/a/b', '/a/b/c'] }), '<PATH> and <PATH>');
});

test('normalize applies user ignore patterns', () => {
  assert.equal(normalize('id=abc123 ok', { ignore: [/id=\w+ /g] }), 'ok');
});

test('difference: exit code, signal, timeout, spawn error', () => {
  const norm = { baseNorm: 'x', runNorm: 'x' };
  assert.equal(difference(run({}), run({}), 'exit', norm), null);
  assert.equal(difference(run({}), run({ code: 1 }), 'exit', norm), 'exit');
  assert.equal(difference(run({}), run({ code: null, signal: 'SIGKILL' }), 'exit', norm), 'exit');
  assert.equal(difference(run({}), run({ timedOut: true, code: null }), 'exit', norm), 'timeout');
  assert.equal(difference(run({}), run({ spawnError: 'boom' }), 'exit', norm), 'spawn');
});

test('difference: output only matters in output mode', () => {
  const norm = { baseNorm: 'a', runNorm: 'b' };
  assert.equal(difference(run({}), run({}), 'exit', norm), null);
  assert.equal(difference(run({}), run({}), 'output', norm), 'output');
});

test('excerpt starts at the first new error-looking line and stops at known lines', () => {
  const base = 'ok one\nok two';
  const got = 'ok one\nFAIL two\nexpected 1, got 2\nok two\nFAIL three';
  assert.deepEqual(excerpt(normalize(base), normalize(got)), ['FAIL two', 'expected 1, got 2']);
});

test('excerpt falls back to the tail when nothing is new', () => {
  assert.deepEqual(excerpt('a\nb\nc\nd', 'a\nb\nc\nd', 2), ['c', 'd']);
});
