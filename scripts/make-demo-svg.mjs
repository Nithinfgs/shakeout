#!/usr/bin/env node
// Renders docs/assets/demo.svg: an animated terminal showing REAL shakeout output
// against examples/demo-app. Run `npm run demo:svg` to regenerate it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A representative subset keeps the hero short; the full 20-perturbation run is `npm run demo`.
const SKIP =
  'tz-pago-pago,tz-kolkata,locale-unset,locale-turkish,path-unicode,path-deep,term-dumb,ci-off,py-hashseed,single-cpu,locale-c';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINES = 40;
const COLS = 100;
const CHAR_W = 8.4;
const LINE_H = 19;
const PAD = 22;
const TOP = 46; // title bar
const CYCLE = 16; // seconds per loop

const run = spawnSync(
  process.execPath,
  [resolve(root, 'bin/shakeout.js'), '--color', '--skip', SKIP, '--', 'node', 'checks.js'],
  {
    cwd: resolve(root, 'examples/demo-app'),
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC', NO_COLOR: '' },
  },
);
if (run.status !== 1) {
  console.error(run.stderr || run.stdout);
  throw new Error(`expected exit code 1 from the demo app, got ${run.status}`);
}

const COLORS = { 1: 'b', 2: 'dim', 31: 'red', 32: 'green', 33: 'yellow', 36: 'cyan' };

/** Parse ANSI SGR text into lines of {ch, cls} cells. */
function parse(text) {
  const lines = [[]];
  let state = new Set();
  const re = /\u001b\[(\d+)m|([\s\S])/gu;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) {
      const code = Number(m[1]);
      if (code === 0) state = new Set();
      else if (COLORS[code]) state.add(COLORS[code]);
    } else if (m[2] === '\n') lines.push([]);
    else lines.at(-1).push({ ch: m[2], cls: [...state].join(' ') });
  }
  return lines;
}

/** Soft-wrap at COLS, indenting continuation lines under the text. */
function wrap(lines) {
  const out = [];
  for (const cells of lines) {
    if (cells.length <= COLS) {
      out.push(cells);
      continue;
    }
    const indent = cells.findIndex((c) => c.ch !== ' ');
    const hang = Math.min(indent + 2, 8);
    let rest = cells;
    let first = true;
    while (rest.length > (first ? COLS : COLS - hang)) {
      const limit = first ? COLS : COLS - hang;
      let cut = limit;
      for (let i = limit; i > limit / 2; i--) {
        if (rest[i].ch === ' ') {
          cut = i;
          break;
        }
      }
      out.push((first ? [] : Array(hang).fill({ ch: ' ', cls: '' })).concat(rest.slice(0, cut)));
      rest = rest.slice(cut).filter((_, i) => i > 0 || rest[cut].ch !== ' ');
      first = false;
    }
    out.push(
      Array(first ? 0 : hang)
        .fill({ ch: ' ', cls: '' })
        .concat(rest),
    );
  }
  return out;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spans(cells) {
  let html = '';
  let i = 0;
  while (i < cells.length) {
    let j = i;
    while (j < cells.length && cells[j].cls === cells[i].cls) j++;
    const text = esc(
      cells
        .slice(i, j)
        .map((c) => c.ch)
        .join(''),
    );
    html += cells[i].cls ? `<tspan class="${cells[i].cls}">${text}</tspan>` : text;
    i = j;
  }
  return html;
}

let lines = wrap(parse(run.stdout.trimEnd()));
let elided = 0;
if (lines.length > MAX_LINES) {
  elided = lines.length - MAX_LINES;
  lines = lines.slice(0, MAX_LINES);
}
const prompt = [
  { ch: '$', cls: 'green' },
  ...[...' shakeout -- node checks.js'].map((ch) => ({ ch, cls: '' })),
];
const all = [prompt, [], ...lines];
if (elided)
  all.push(
    [],
    [...`  ... ${elided} more lines`].map((ch) => ({ ch, cls: 'dim' })),
  );

// Timing: prompt at 0.3s, then the progress list ticks one perturbation at a time,
// then the findings appear in a few batches.
const startAt = [];
let t = 0.4;
for (let i = 0; i < all.length; i++) {
  const text = all[i].map((c) => c.ch).join('');
  startAt.push(t);
  if (i === 0) t += 0.9;
  else if (/^\s+[✔✘~] /u.test(text)) t += 0.22;
  else if (text.trim() === '') t += 0.05;
  else t += 0.25;
}
const hold = Math.min(CYCLE - 2.5, Math.max(t + 3, 8));

const height = TOP + PAD + all.length * LINE_H + PAD;
const width = Math.ceil(COLS * CHAR_W + PAD * 2);
const pct = (s) => ((s / hold) * 100).toFixed(2);
const css = all
  .map(
    (_, i) =>
      `.l${i}{animation:r${i} ${hold}s linear infinite}@keyframes r${i}{0%,${pct(startAt[i])}%{opacity:0}${(Number(pct(startAt[i])) + 0.5).toFixed(2)}%,92%{opacity:1}100%{opacity:0}}`,
  )
  .join('\n');

const body = all
  .map(
    (cells, i) =>
      `<text class="l${i}" x="${PAD}" y="${TOP + PAD + i * LINE_H}" xml:space="preserve">${spans(cells)}</text>`,
  )
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Terminal recording: shakeout runs a test command under environment changes and reports that timezone, locale, empty HOME and a TMPDIR with a space each break it.">
<style>
text{font:13.5px ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace;fill:#d4d7e0;white-space:pre}
.b{font-weight:700;fill:#fff}.dim{fill:#7d8498}.red{fill:#ff6b6b}.green{fill:#6ee7a0}.yellow{fill:#f5d76e}.cyan{fill:#72c7ee}
${css}
</style>
<rect width="${width}" height="${height}" rx="12" fill="#14161c"/>
<rect width="${width}" height="${TOP - 8}" rx="12" fill="#1d2029"/>
<rect y="${TOP - 20}" width="${width}" height="12" fill="#1d2029"/>
<circle cx="24" cy="19" r="6" fill="#ff5f57"/><circle cx="44" cy="19" r="6" fill="#febc2e"/><circle cx="64" cy="19" r="6" fill="#28c840"/>
<text x="${width / 2}" y="24" text-anchor="middle" style="fill:#7d8498;font-size:12.5px">examples/demo-app</text>
${body}
</svg>
`;

const out = resolve(root, 'docs/assets/demo.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(
  `wrote ${out} (${(svg.length / 1024).toFixed(1)} KB, ${all.length} lines, loop ${hold.toFixed(1)}s)`,
);
