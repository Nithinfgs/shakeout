const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|µs|us|s|sec|seconds?)\b/g;
const ISO_TS = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const SIGNAL_WORDS = /(error|fail|not ok|✘|✖|assert|exception|expected|cannot|denied|no such|enoent|panic)/i;

/**
 * Make output comparable across runs: strip colour, mask volatile paths, durations
 * and timestamps, then apply the user's own ignore patterns.
 * @param {string} text
 * @param {{paths?: string[], ignore?: RegExp[]}} [opts]
 */
export function normalize(text, opts = {}) {
  let out = text.replace(ANSI, '').replace(/\r\n?/g, '\n');
  // longest first so a parent path never masks a more specific child
  const paths = [...(opts.paths ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of paths) out = out.split(p).join('<PATH>');
  out = out.replace(ISO_TS, '<TS>').replace(DURATION, '<T>');
  for (const re of opts.ignore ?? []) out = out.replace(re, '');
  return out
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Did this run behave differently from the baseline?
 * @param {import('./runner.js').RunResult} base
 * @param {import('./runner.js').RunResult} run
 * @param {'exit'|'output'} mode
 * @param {{baseNorm: string, runNorm: string}} norm
 * @returns {null | 'timeout' | 'spawn' | 'exit' | 'output'}
 */
export function difference(base, run, mode, norm) {
  if (run.spawnError) return 'spawn';
  if (run.timedOut && !base.timedOut) return 'timeout';
  if (run.code !== base.code || run.signal !== base.signal) return 'exit';
  if (mode === 'output' && norm.baseNorm !== norm.runNorm) return 'output';
  return null;
}

const clip = (l) => (l.length > 160 ? `${l.slice(0, 157)}...` : l.trim());

/**
 * Explain a difference in a few lines: the run of up to `max` consecutive new lines starting at the first line
 * that did not appear in the baseline and reads like an error (or, failing that, the first
 * new line, or the tail of the output).
 * @param {string} baseNorm
 * @param {string} runNorm
 * @param {number} [max]
 */
export function excerpt(baseNorm, runNorm, max = 3) {
  const baseLines = new Set(baseNorm.split('\n'));
  const lines = runNorm.split('\n').filter((l) => l.trim() !== '');
  const isNew = (l) => !baseLines.has(l);
  let start = lines.findIndex((l) => isNew(l) && SIGNAL_WORDS.test(l));
  if (start < 0) start = lines.findIndex(isNew);
  if (start < 0) return lines.slice(-max).map(clip);
  const window = [];
  for (const l of lines.slice(start)) {
    if (window.length >= max || (window.length > 0 && !isNew(l))) break;
    window.push(l);
  }
  return window.map(clip);
}
