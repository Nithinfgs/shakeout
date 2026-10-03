/**
 * The perturbation catalogue.
 *
 * A perturbation is a small, realistic change to the environment a command runs in.
 * Every one of them corresponds to a difference you meet between a laptop, CI, a
 * container and a teammate's machine.
 *
 * Template tokens usable in `env` values and `mkdirs`:
 *   {scratch}  a private temp directory owned by this run
 */

/**
 * @typedef {object} Perturbation
 * @property {string} id            unique, kebab-case
 * @property {string} category      tz | locale | home | path | tmp | term | ci | process | net
 * @property {string} description   one line, shown in `--list` and reports
 * @property {Record<string,string>} [env]  variables to set
 * @property {string[]} [unset]     variables to remove (trailing `*` is a prefix glob)
 * @property {string[]} [mkdirs]    directories to create before the run (templated)
 * @property {string} [path]        run from a copy of the project placed under this relative path
 * @property {string} [umask]       umask to apply (POSIX only)
 * @property {boolean} [optIn]      only runs with `--all` or when selected explicitly
 * @property {string} hint          what a failure here usually means
 */

const DEEP = Array.from({ length: 16 }, (_, i) => `level-${i}-nested-directory`).join('/');

/** @type {Perturbation[]} */
export const BUILTIN = [
  {
    id: 'tz-utc',
    category: 'tz',
    description: 'TZ=UTC, what most CI runners and containers use',
    env: { TZ: 'UTC' },
    hint: 'Code relies on the machine being in a local timezone. Pass the timezone or clock in explicitly.',
  },
  {
    id: 'tz-los-angeles',
    category: 'tz',
    description: 'TZ=America/Los_Angeles (UTC-8/-7, observes DST)',
    env: { TZ: 'America/Los_Angeles' },
    hint: 'A date-only string like "2024-03-10" is parsed as UTC but read back in local time, which lands on the previous day west of Greenwich.',
  },
  {
    id: 'tz-pago-pago',
    category: 'tz',
    description: 'TZ=Pacific/Pago_Pago (UTC-11, the furthest west)',
    env: { TZ: 'Pacific/Pago_Pago' },
    hint: 'Same family as tz-los-angeles: UTC-parsed dates read back in local time shift by a day.',
  },
  {
    id: 'tz-kolkata',
    category: 'tz',
    description: 'TZ=Asia/Kolkata (UTC+5:30, a half-hour offset)',
    env: { TZ: 'Asia/Kolkata' },
    hint: 'Code assumes whole-hour timezone offsets.',
  },
  {
    id: 'tz-kiritimati',
    category: 'tz',
    description: 'TZ=Pacific/Kiritimati (UTC+14, the furthest east)',
    env: { TZ: 'Pacific/Kiritimati' },
    hint: 'Local time is more than 12h ahead of UTC, so "local noon" is still yesterday in UTC.',
  },
  {
    id: 'locale-c',
    category: 'locale',
    description: 'LC_ALL=C: the bare POSIX locale used by minimal containers',
    env: { LC_ALL: 'C', LANG: 'C' },
    unset: ['LANGUAGE'],
    hint: 'Code assumes UTF-8 or locale-aware sorting. Non-ASCII input and `sort` order are the usual suspects.',
  },
  {
    id: 'locale-unset',
    category: 'locale',
    description: 'No LANG / LC_* variables at all',
    unset: ['LANG', 'LANGUAGE', 'LC_*'],
    hint: 'Code reads a locale variable and does not handle it being missing.',
  },
  {
    id: 'locale-turkish',
    category: 'locale',
    description: 'LC_ALL=tr_TR.UTF-8: dotted and dotless i',
    env: { LC_ALL: 'tr_TR.UTF-8', LANG: 'tr_TR.UTF-8' },
    hint: 'Something follows the ambient locale: number and date formatting (1.234,5), or case mapping in Java toLowerCase(), C tolower() and `tr`, where "TITLE" becomes "tıtle". Pin the locale for anything that is a key, a slug or a wire format.',
  },
  {
    id: 'locale-german',
    category: 'locale',
    description: 'LC_ALL=de_DE.UTF-8: 1.234,5 instead of 1,234.5',
    env: { LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8' },
    hint: 'Number or date formatting uses the ambient locale and the result is compared or parsed as if it were en-US.',
  },
  {
    id: 'home-empty',
    category: 'home',
    description: 'HOME points at a brand-new empty directory',
    env: { HOME: '{scratch}/home-empty', USERPROFILE: '{scratch}/home-empty' },
    unset: ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME'],
    mkdirs: ['{scratch}/home-empty'],
    hint: 'Code assumes ~/.config, ~/.cache or a dotfile already exists. A fresh CI user or container has none of them.',
  },
  {
    id: 'path-spaces',
    category: 'path',
    description: 'Project checked out under a directory with spaces in its name',
    path: 'my project',
    hint: 'A script or Makefile uses an unquoted path variable and word-splits at the space.',
  },
  {
    id: 'path-unicode',
    category: 'path',
    description: 'Project checked out under a non-ASCII path',
    path: 'prøjekt-日本語',
    hint: 'Something assumes an ASCII-only path or a specific filesystem encoding.',
  },
  {
    id: 'path-deep',
    category: 'path',
    description: 'Project checked out 16 directories deep (a ~350 character path)',
    path: DEEP,
    hint: 'A tool, socket path or archive entry has a path-length limit (104 bytes for Unix sockets on macOS, 260 on legacy Windows).',
  },
  {
    id: 'tmpdir-spaces',
    category: 'tmp',
    description: 'TMPDIR contains a space',
    env: { TMPDIR: '{scratch}/tmp dir', TEMP: '{scratch}/tmp dir', TMP: '{scratch}/tmp dir' },
    mkdirs: ['{scratch}/tmp dir'],
    hint: 'Temp-file paths are interpolated into a shell command without quoting.',
  },
  {
    id: 'term-dumb',
    category: 'term',
    description: 'TERM=dumb, NO_COLOR=1, COLUMNS=40',
    env: { TERM: 'dumb', NO_COLOR: '1', COLUMNS: '40', LINES: '12' },
    hint: 'Output parsing or snapshot tests depend on colour codes or terminal width.',
  },
  {
    id: 'ci-on',
    category: 'ci',
    description: 'CI=true and GITHUB_ACTIONS=true',
    env: { CI: 'true', GITHUB_ACTIONS: 'true' },
    hint: 'A tool switches to a different mode on CI (watch off, prompts off, retries on) and your command depends on the difference.',
  },
  {
    id: 'ci-off',
    category: 'ci',
    description: 'Every CI marker variable removed',
    unset: ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'TF_BUILD', 'JENKINS_URL'],
    hint: 'Your command only behaves when a CI variable is present, for example a missing --ci flag.',
  },
  {
    id: 'umask-077',
    category: 'process',
    description: 'umask 077: files created are private to the owner',
    umask: '077',
    hint: 'A step creates files and then expects another user, container or process to be able to read them.',
  },
  {
    id: 'single-cpu',
    category: 'process',
    description: 'Thread pools pinned to one worker (GOMAXPROCS, UV_THREADPOOL_SIZE, RAYON, OMP)',
    env: { GOMAXPROCS: '1', UV_THREADPOOL_SIZE: '1', RAYON_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
    hint: 'A deadlock or timeout that needs more than one worker. Common in small CI containers.',
  },
  {
    id: 'py-hashseed',
    category: 'process',
    description: 'PYTHONHASHSEED=12345: different set and dict-of-str iteration order',
    env: { PYTHONHASHSEED: '12345' },
    hint: 'Python code or tests depend on the iteration order of sets or hash-randomised structures.',
  },
  {
    id: 'net-blackhole',
    category: 'net',
    description: 'HTTP(S)_PROXY points at a closed port: proxy-aware tools cannot reach the network',
    env: {
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      http_proxy: 'http://127.0.0.1:9',
      https_proxy: 'http://127.0.0.1:9',
    },
    unset: ['NO_PROXY', 'no_proxy'],
    optIn: true,
    hint: 'The command quietly needs the network. Only affects tools that honour proxy variables.',
  },
];

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate a user-supplied perturbation from shakeout.json.
 * @param {any} p
 * @returns {Perturbation}
 */
export function validateCustom(p) {
  if (!p || typeof p !== 'object') throw new Error('perturbation must be an object');
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) {
    throw new Error(`perturbation id ${JSON.stringify(p.id)} must match ${ID_RE}`);
  }
  if (BUILTIN.some((b) => b.id === p.id)) {
    throw new Error(`perturbation id "${p.id}" collides with a built-in; pick another`);
  }
  const hasEffect = p.env || p.unset || p.path || p.umask;
  if (!hasEffect) throw new Error(`perturbation "${p.id}" changes nothing (needs env, unset, path or umask)`);
  if (p.env && Object.values(p.env).some((v) => typeof v !== 'string')) {
    throw new Error(`perturbation "${p.id}": env values must be strings`);
  }
  if (p.path && (p.path.startsWith('/') || p.path.split('/').includes('..'))) {
    throw new Error(`perturbation "${p.id}": path must be relative and may not contain ".."`);
  }
  return {
    id: p.id,
    category: typeof p.category === 'string' ? p.category : 'custom',
    description: typeof p.description === 'string' ? p.description : p.id,
    env: p.env,
    unset: p.unset,
    mkdirs: p.mkdirs,
    path: p.path,
    umask: p.umask,
    optIn: false,
    hint: typeof p.hint === 'string' ? p.hint : 'This custom perturbation changed the result.',
  };
}

/**
 * Decide which perturbations run.
 * `only` and `skip` entries match either an id or a category.
 * @param {Perturbation[]} all
 * @param {{only?: string[], skip?: string[], all?: boolean}} sel
 */
export function select(all, sel = {}) {
  const only = sel.only ?? [];
  const skip = sel.skip ?? [];
  const known = new Set(all.flatMap((p) => [p.id, p.category]));
  for (const name of [...only, ...skip]) {
    if (!known.has(name)) {
      throw new Error(`unknown perturbation or category "${name}" (see --list)`);
    }
  }
  const matches = (p, names) => names.includes(p.id) || names.includes(p.category);
  return all.filter((p) => {
    if (matches(p, skip)) return false;
    if (only.length) return matches(p, only);
    return sel.all || !p.optIn;
  });
}
