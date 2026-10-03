import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { difference, excerpt, normalize } from './analyze.js';
import { buildEnv, runCommand } from './runner.js';

/** Directories never copied into a relocated checkout. `node_modules` is symlinked instead. */
const NOT_COPIED = new Set(['.git', 'node_modules', '.shakeout']);

export class BaselineError extends Error {}

/**
 * @typedef {object} Options
 * @property {string[]} argv
 * @property {boolean} shell
 * @property {string} cwd
 * @property {import('./perturbations.js').Perturbation[]} perturbations
 * @property {'exit'|'output'} compare
 * @property {number} timeoutMs
 * @property {number} confirm         extra runs used to confirm a difference
 * @property {number} baselineRuns
 * @property {RegExp[]} ignore
 * @property {boolean} keep           keep scratch directories
 * @property {(e: {type: string, [k: string]: any}) => void} [onEvent]
 */

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {string} category
 * @property {string} description
 * @property {'stable'|'sensitive'|'flaky'} status
 * @property {null|'exit'|'output'|'timeout'|'spawn'} kind
 * @property {number|null} code
 * @property {string|null} signal
 * @property {number} durationMs
 * @property {{reproduced: number, total: number}} confirmation
 * @property {string[]} excerpt
 * @property {string} hint
 * @property {string|null} repro   shell command that reproduces the perturbation, when it is a plain env change
 * @property {string} fullOutput
 */

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

/**
 * A command a human can paste to reproduce a perturbation by hand. Only offered for plain
 * environment changes; path, temp-dir and umask perturbations need more than a prefix.
 * @param {import('./perturbations.js').Perturbation} p
 * @param {Options} opts
 * @returns {string|null}
 */
export function reproCommand(p, opts) {
  if (p.path || p.umask || p.mkdirs?.length) return null;
  const unset = p.unset ?? [];
  if (unset.some((u) => u.endsWith('*'))) return null;
  const parts = [
    'env',
    ...unset.map((u) => `-u ${u}`),
    ...Object.entries(p.env ?? {}).map(([k, v]) => `${k}=${quote(v)}`),
  ];
  if (parts.length === 1) return null;
  const cmd = opts.shell ? `sh -c ${quote(opts.argv.join(' '))}` : opts.argv.map(quote).join(' ');
  return `${parts.join(' ')} ${cmd}`;
}

const template = (s, vars) => s.replaceAll('{scratch}', vars.scratch);

function copyProject(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => !NOT_COPIED.has(basename(from)) || resolve(from) === resolve(src),
  });
  const modules = join(src, 'node_modules');
  if (existsSync(modules)) symlinkSync(modules, join(dest, 'node_modules'), 'dir');
}

/**
 * Run the command once normally, then once per perturbation.
 * @param {Options} opts
 */
export async function shakeout(opts) {
  const emit = opts.onEvent ?? (() => {});
  // realpath so macOS /var -> /private/var does not defeat path masking
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'shakeout-')));
  const vars = { scratch };
  const maskPaths = [opts.cwd, scratch];
  const normOpts = { paths: maskPaths, ignore: opts.ignore };
  const copies = new Map();

  try {
    const run = (p) => {
      const env = buildEnv(
        process.env,
        Object.fromEntries(Object.entries(p?.env ?? {}).map(([k, v]) => [k, template(v, vars)])),
        p?.unset,
      );
      for (const d of p?.mkdirs ?? []) mkdirSync(template(d, vars), { recursive: true });
      let cwd = opts.cwd;
      if (p?.path) {
        if (!copies.has(p.path)) {
          const root = join(scratch, 'checkouts', p.path);
          copyProject(opts.cwd, root);
          copies.set(p.path, root);
        }
        cwd = copies.get(p.path);
      }
      return runCommand({
        argv: opts.argv,
        shell: opts.shell,
        cwd,
        env,
        timeoutMs: opts.timeoutMs,
        umask: p?.umask,
      });
    };

    // --- baseline -------------------------------------------------------
    emit({ type: 'baseline:start' });
    const baselines = [];
    for (let i = 0; i < Math.max(1, opts.baselineRuns); i++) baselines.push(await run(undefined));
    const baseline = baselines[0];
    const baseNorm = normalize(baseline.output, normOpts);
    if (baseline.spawnError) {
      throw new BaselineError(`could not start the command: ${baseline.spawnError}`);
    }
    if (baseline.timedOut) {
      throw new BaselineError(`the baseline run timed out after ${opts.timeoutMs / 1000}s; raise --timeout`);
    }
    if (opts.compare === 'exit' && baseline.code !== 0) {
      throw new BaselineError(
        `the command exits with ${baseline.signal ?? baseline.code} even without any change, so there is nothing to compare.\n` +
          '  Fix it first, or use --compare output to look for output differences instead.',
      );
    }
    const baselineFlaky = baselines.slice(1).some((b) => {
      const n = normalize(b.output, normOpts);
      return difference(baseline, b, opts.compare, { baseNorm, runNorm: n }) !== null;
    });
    emit({ type: 'baseline:done', result: baseline, flaky: baselineFlaky });

    // --- perturbations --------------------------------------------------
    /** @type {Finding[]} */
    const findings = [];
    for (const p of opts.perturbations) {
      emit({ type: 'perturbation:start', id: p.id });
      const check = async () => {
        const r = await run(p);
        const runNorm = normalize(r.output, normOpts);
        return { r, runNorm, kind: difference(baseline, r, opts.compare, { baseNorm, runNorm }) };
      };
      const first = await check();
      let reproduced = 0;
      let total = 1;
      if (first.kind) {
        reproduced = 1;
        for (let i = 0; i < opts.confirm; i++) {
          total++;
          if ((await check()).kind) reproduced++;
        }
      }
      /** @type {Finding['status']} */
      const status = !first.kind ? 'stable' : reproduced === total ? 'sensitive' : 'flaky';
      const lines = first.kind
        ? first.kind === 'timeout'
          ? [`no result within ${opts.timeoutMs / 1000}s`]
          : first.kind === 'spawn'
            ? [first.r.spawnError ?? 'could not start']
            : excerpt(baseNorm, first.runNorm)
        : [];
      /** @type {Finding} */
      const finding = {
        id: p.id,
        category: p.category,
        description: p.description,
        status,
        kind: first.kind,
        code: first.r.code,
        signal: first.r.signal,
        durationMs: first.r.durationMs,
        confirmation: { reproduced, total },
        excerpt: lines,
        hint: p.hint,
        repro: reproCommand(p, opts),
        fullOutput: first.kind ? first.runNorm : '',
      };
      findings.push(finding);
      emit({ type: 'perturbation:done', finding });
    }

    return {
      command: opts.argv.join(' '),
      compare: opts.compare,
      baseline: {
        code: baseline.code,
        durationMs: baseline.durationMs,
        flaky: baselineFlaky,
        runs: baselines.length,
      },
      findings,
      summary: {
        total: findings.length,
        stable: findings.filter((f) => f.status === 'stable').length,
        sensitive: findings.filter((f) => f.status === 'sensitive').length,
        flaky: findings.filter((f) => f.status === 'flaky').length,
      },
      scratch: opts.keep ? scratch : null,
    };
  } finally {
    if (!opts.keep) rmSync(scratch, { recursive: true, force: true });
  }
}
