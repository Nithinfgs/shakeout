import { spawn } from 'node:child_process';

const MAX_OUTPUT = 2 * 1024 * 1024;

/**
 * @typedef {object} RunResult
 * @property {number|null} code
 * @property {string|null} signal
 * @property {string} output       stdout and stderr interleaved in arrival order
 * @property {number} durationMs
 * @property {boolean} timedOut
 * @property {string|null} spawnError
 * @property {boolean} truncated
 */

/**
 * Build the child environment from a base env and a perturbation's set/unset lists.
 * @param {NodeJS.ProcessEnv} base
 * @param {Record<string,string>} [set]
 * @param {string[]} [unset]  names, or prefixes ending in `*`
 */
export function buildEnv(base, set = {}, unset = []) {
  /** @type {Record<string,string>} */
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    const drop = unset.some((u) => (u.endsWith('*') ? k.startsWith(u.slice(0, -1)) : k === u));
    if (!drop) env[k] = v;
  }
  return { ...env, ...set };
}

/**
 * Run a command to completion without a TTY, killing its whole process group on timeout.
 * @param {{argv: string[], shell: boolean, cwd: string, env: Record<string,string>,
 *          timeoutMs: number, umask?: string}} o
 * @returns {Promise<RunResult>}
 */
export function runCommand({ argv, shell, cwd, env, timeoutMs, umask }) {
  return new Promise((resolve) => {
    let file;
    let args;
    if (shell) {
      file = 'sh';
      args = ['-c', argv.join(' ')];
    } else {
      [file, ...args] = argv;
    }
    if (umask && process.platform !== 'win32') {
      args = ['-c', `umask ${umask}; exec "$@"`, 'sh', file, ...args];
      file = 'sh';
    }

    const started = Date.now();
    let output = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const done = (partial) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: null,
        signal: null,
        spawnError: null,
        ...partial,
        output,
        truncated,
        timedOut,
        durationMs: Date.now() - started,
      });
    };

    const child = spawn(file, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const collect = (chunk) => {
      if (output.length >= MAX_OUTPUT) {
        truncated = true;
        return;
      }
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-(/** @type {number} */ (child.pid)), 'SIGKILL');
      } catch {
        // already gone
      }
    }, timeoutMs);

    child.on('error', (err) => done({ spawnError: err.message }));
    child.on('close', (code, signal) => done({ code, signal }));
  });
}
