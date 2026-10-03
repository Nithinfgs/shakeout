// Plain assertions so the demo has no dependencies. Every check passes on a
// typical developer laptop; each hides one assumption about the environment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cachedFonts, dayOfMonth, formatTotal, scheduledDay } from './src/invoice.js';

const checks = {
  'invoice dated 2024-03-10 is on the 10th': () => assert.equal(dayOfMonth('2024-03-10'), 10),
  'noon job on 2024-06-01 is scheduled for 2024-06-01': () =>
    assert.equal(scheduledDay(2024, 6, 1), '2024-06-01'),
  'total 1234567.5 renders as 1,234,567.5': () => assert.equal(formatTotal(1234567.5), '1,234,567.5'),
  'font cache directory ~/.cache can be listed': () => cachedFonts(),
  'pack.sh packs both sample files': () => {
    const out = execFileSync('sh', ['scripts/pack.sh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(out, /^packed 2 files/);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(checks)) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    const msg =
      err.code === 'ERR_ASSERTION' && 'actual' in err
        ? `expected ${JSON.stringify(err.expected)}, got ${JSON.stringify(err.actual)}`
        : (String(err.stderr || err.message)
            .split('\n')
            .find((l) => l.trim()) ?? 'failed');
    console.log(`FAIL ${name}\n     ${msg}`);
  }
}
process.exit(failed ? 1 : 0);
