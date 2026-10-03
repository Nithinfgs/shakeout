/**
 * Terminal, Markdown and JSON renderers. Pure functions: they return strings.
 */

const SGR = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 };

/** @param {boolean} enabled */
export function painter(enabled) {
  const wrap = (code) => (s) => (enabled ? `\u001b[${code}m${s}\u001b[${SGR.reset}m` : String(s));
  return {
    bold: wrap(SGR.bold),
    dim: wrap(SGR.dim),
    red: wrap(SGR.red),
    green: wrap(SGR.green),
    yellow: wrap(SGR.yellow),
    cyan: wrap(SGR.cyan),
  };
}

const secs = (ms) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

function describeKind(f) {
  if (f.kind === 'timeout') return 'timed out';
  if (f.kind === 'spawn') return 'could not start';
  if (f.kind === 'output') return 'output changed';
  return f.signal ? `killed by ${f.signal}` : `exit ${f.code}`;
}

/**
 * One line shown while running (stderr, TTY only).
 * @param {import('./engine.js').Finding} f
 * @param {ReturnType<typeof painter>} c
 * @param {number} width id column width
 */
export function progressLine(f, c, width) {
  const id = f.id.padEnd(width);
  if (f.status === 'stable') return `  ${c.green('✔')} ${id} ${c.dim('same')}`;
  if (f.status === 'flaky') {
    return `  ${c.yellow('~')} ${id} ${c.yellow('flaky')} ${c.dim(`${f.confirmation.reproduced}/${f.confirmation.total} reproduced`)}`;
  }
  return `  ${c.red('✘')} ${id} ${c.red(describeKind(f))} ${c.dim(`${f.confirmation.reproduced}/${f.confirmation.total} reproduced`)}`;
}

/**
 * Full terminal report.
 * @param {any} report
 * @param {{color: boolean, verbose?: boolean}} o
 */
export function renderTerminal(report, { color, verbose = false }) {
  const c = painter(color);
  const out = [];
  const { summary, findings } = report;
  const width = Math.max(...findings.map((f) => f.id.length), 10);

  out.push(
    `${c.bold('shakeout')} ${c.dim('·')} ${report.command} ${c.dim('·')} ${summary.total} perturbation${summary.total === 1 ? '' : 's'} ${c.dim('·')} baseline ok ${c.dim(`(${secs(report.baseline.durationMs)})`)}`,
  );
  if (report.baseline.flaky) {
    out.push(c.yellow('  warning: the baseline itself is not stable across runs; findings may be noise'));
  }
  out.push('');
  for (const f of findings) out.push(progressLine(f, c, width));
  out.push('');

  const sensitive = findings.filter((f) => f.status === 'sensitive');
  const flaky = findings.filter((f) => f.status === 'flaky');

  if (!sensitive.length && !flaky.length) {
    out.push(
      c.green(
        `No environment sensitivity found across ${summary.total} perturbation${summary.total === 1 ? '' : 's'}.`,
      ),
    );
    return out.join('\n');
  }

  if (sensitive.length) {
    out.push(c.bold(`${sensitive.length} environment assumption${sensitive.length === 1 ? '' : 's'} found`));
    out.push('');
    for (const f of sensitive) {
      out.push(`${c.red('✘')} ${c.bold(f.id)} ${c.dim(`[${f.category}]`)}  ${f.description}`);
      for (const line of f.excerpt) out.push(`    ${c.cyan('│')} ${line}`);
      out.push(`    ${c.dim('→')} ${f.hint}`);
      if (f.repro) out.push(`    ${c.dim('$')} ${f.repro}`);
      if (verbose && f.fullOutput) {
        out.push(c.dim('    full output:'));
        for (const l of f.fullOutput.split('\n')) out.push(c.dim(`      ${l}`));
      }
      out.push('');
    }
  }
  if (flaky.length) {
    out.push(
      c.yellow(
        `${flaky.length} intermittent: ${flaky.map((f) => f.id).join(', ')}. They did not reproduce every time, so they are probably ordinary flakiness rather than an environment assumption.`,
      ),
    );
    out.push('');
  }
  out.push(
    c.dim(
      'Perturbations that cannot be reproduced with an env prefix (paths, TMPDIR, umask) are described by `shakeout --list`.',
    ),
  );
  return out.join('\n');
}

/**
 * GitHub-flavoured Markdown, suitable for $GITHUB_STEP_SUMMARY or a PR comment.
 * @param {any} report
 */
export function renderMarkdown(report) {
  const { summary, findings } = report;
  const out = [];
  out.push('## shakeout');
  out.push('');
  out.push(
    `\`${report.command}\` under ${summary.total} environment perturbation${summary.total === 1 ? '' : 's'}.`,
  );
  out.push('');
  if (!summary.sensitive && !summary.flaky) {
    out.push(`✅ No environment sensitivity found.`);
    return out.join('\n');
  }
  out.push(
    `**${summary.sensitive}** sensitive, **${summary.flaky}** intermittent, ${summary.stable} stable.`,
  );
  out.push('');
  out.push('| Perturbation | Category | Result | Reproduced |');
  out.push('| --- | --- | --- | --- |');
  for (const f of findings.filter((x) => x.status !== 'stable')) {
    out.push(
      `| \`${f.id}\` | ${f.category} | ${f.status === 'flaky' ? 'intermittent' : describeKind(f)} | ${f.confirmation.reproduced}/${f.confirmation.total} |`,
    );
  }
  for (const f of findings.filter((x) => x.status === 'sensitive')) {
    out.push('');
    out.push(`### \`${f.id}\``);
    out.push('');
    out.push(f.description);
    if (f.excerpt.length) {
      out.push('');
      out.push('```text');
      out.push(...f.excerpt);
      out.push('```');
    }
    out.push('');
    out.push(`> ${f.hint}`);
    if (f.repro) {
      out.push('');
      out.push('```sh');
      out.push(f.repro);
      out.push('```');
    }
  }
  return out.join('\n');
}

/** @param {any} report */
export function renderJson(report) {
  const { scratch, findings, ...rest } = report;
  return JSON.stringify(
    {
      version: 1,
      ...rest,
      findings: findings.map(({ fullOutput, ...f }) => f),
    },
    null,
    2,
  );
}

/**
 * `--list` output.
 * @param {import('./perturbations.js').Perturbation[]} all
 * @param {boolean} color
 */
export function renderList(all, color) {
  const c = painter(color);
  const width = Math.max(...all.map((p) => p.id.length));
  return all
    .map(
      (p) =>
        `${c.bold(p.id.padEnd(width))}  ${c.dim(p.category.padEnd(7))} ${p.description}${p.optIn ? c.dim('  (opt-in: --all)') : ''}`,
    )
    .join('\n');
}
