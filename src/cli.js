import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { BaselineError, shakeout } from './engine.js';
import { BUILTIN, select } from './perturbations.js';
import { messageOf } from './util.js';
import { painter, progressLine, renderJson, renderList, renderMarkdown, renderTerminal } from './report.js';

const HELP = `shakeout: find the hidden environment assumptions in any command

Usage
  shakeout [options] -- <command> [args...]
  shakeout [options] "<shell command>"

Runs your command once as-is, then again under realistic environment changes
(timezone, locale, empty HOME, paths with spaces, CI variables, ...) and tells
you which change flips the result.

Options
  --only <names>       Run only these perturbations or categories (comma separated)
  --skip <names>       Skip these perturbations or categories
  --all                Include opt-in perturbations (e.g. net-blackhole)
  --compare <mode>     exit (default): pass/fail only
                       output: also flag any change in normalised output
  --ignore <regex>     Remove matches from output before comparing (repeatable)
  --timeout <seconds>  Per-run timeout (default 120)
  --confirm <n>        Extra reruns used to confirm a difference (default 2)
  --baseline-runs <n>  Baseline repetitions, to detect an unstable baseline (default 1)
  --json               Print a JSON report to stdout
  --markdown           Print a Markdown report to stdout
  --verbose            Show full output of each failing run
  --keep               Keep the scratch directory and print its location
  --config <file>      Config file (default: ./shakeout.json when present)
  --list               List perturbations and exit
  --color              Force colour even when piped
  --no-color           Disable colour
  -h, --help           Show this help
  -v, --version        Show version

Exit codes
  0  no sensitivity found    1  at least one found    2  usage error or baseline failed

Examples
  shakeout -- npm test
  shakeout --only tz,locale -- pytest -q
  shakeout --compare output -- ./build.sh
`;

const split = (values) =>
  (values ?? [])
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);

function toInt(name, value, fallback, min) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`--${name} must be a number >= ${min}`);
  return n;
}

/**
 * @param {string[]} argv  arguments after `node shakeout`
 * @param {{stdout: {write(s: string): any, isTTY?: boolean}, stderr: {write(s: string): any, isTTY?: boolean}, cwd: string, env: NodeJS.ProcessEnv}} io
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        only: { type: 'string', multiple: true },
        skip: { type: 'string', multiple: true },
        all: { type: 'boolean' },
        compare: { type: 'string' },
        ignore: { type: 'string', multiple: true },
        timeout: { type: 'string' },
        confirm: { type: 'string' },
        'baseline-runs': { type: 'string' },
        json: { type: 'boolean' },
        markdown: { type: 'boolean' },
        verbose: { type: 'boolean' },
        keep: { type: 'boolean' },
        config: { type: 'string' },
        list: { type: 'boolean' },
        color: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    io.stderr.write(
      `shakeout: ${messageOf(err)}\nRun \`shakeout --help\` for usage. Put your command after \`--\`.\n`,
    );
    return 2;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    io.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const machineOutput = Boolean(values.json || values.markdown);
  const wantsColor = values.color || (!io.env.NO_COLOR && Boolean(io.stdout.isTTY));
  const color = !values['no-color'] && !machineOutput && Boolean(wantsColor);

  try {
    const config = loadConfig(io.cwd, values.config);
    const catalogue = [...BUILTIN, ...(config.perturbations ?? [])];

    if (values.list) {
      io.stdout.write(`${renderList(catalogue, color)}\n`);
      return 0;
    }
    if (positionals.length === 0) {
      io.stderr.write(
        'shakeout: no command given.\n\n  shakeout -- npm test\n\nRun `shakeout --help` for usage.\n',
      );
      return 2;
    }

    const compare = values.compare ?? config.compare ?? 'exit';
    if (compare !== 'exit' && compare !== 'output') throw new Error('--compare must be "exit" or "output"');

    const only = values.only ? split(values.only) : (config.only ?? []);
    const skip = [...split(values.skip), ...(config.skip ?? [])];
    const perturbations = select(catalogue, { only, skip, all: values.all });
    if (perturbations.length === 0) throw new Error('the selection matched no perturbations');

    const ignore = [...(config.ignore ?? []), ...(values.ignore ?? [])].map((s) => {
      try {
        return new RegExp(s, 'g');
      } catch {
        throw new Error(`invalid --ignore pattern: ${s}`);
      }
    });

    const single = positionals.length === 1 && /\s/.test(positionals[0]);
    const width = Math.max(...perturbations.map((p) => p.id.length), 10);
    const c = painter(Boolean(io.stderr.isTTY) && !values['no-color'] && !io.env.NO_COLOR);
    const live = Boolean(io.stderr.isTTY) && !machineOutput;

    const report = await shakeout({
      argv: positionals,
      shell: single,
      cwd: io.cwd,
      perturbations,
      compare,
      timeoutMs: toInt('timeout', values.timeout, config.timeout ?? 120, 1) * 1000,
      confirm: toInt('confirm', values.confirm, config.confirm ?? 2, 0),
      baselineRuns: toInt('baseline-runs', values['baseline-runs'], 1, 1),
      ignore,
      keep: Boolean(values.keep),
      onEvent(e) {
        if (!live) return;
        if (e.type === 'baseline:start') io.stderr.write(c.dim('baseline run...\n'));
        if (e.type === 'perturbation:done') io.stderr.write(`${progressLine(e.finding, c, width)}\n`);
      },
    });

    if (values.json) io.stdout.write(`${renderJson(report)}\n`);
    else if (values.markdown) io.stdout.write(`${renderMarkdown(report)}\n`);
    else {
      // Findings were already streamed to the TTY; print the report in full when piped.
      io.stdout.write(`${renderTerminal(report, { color, verbose: values.verbose })}\n`);
    }
    if (report.scratch) io.stderr.write(`scratch directory kept: ${report.scratch}\n`);
    return report.summary.sensitive > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof BaselineError) {
      io.stderr.write(`shakeout: baseline failed: ${err.message}\n`);
    } else {
      io.stderr.write(`shakeout: ${messageOf(err)}\n`);
    }
    return 2;
  }
}
