import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCustom } from './perturbations.js';
import { messageOf } from './util.js';

export const CONFIG_FILE = 'shakeout.json';

/**
 * @typedef {object} FileConfig
 * @property {'exit'|'output'} [compare]
 * @property {number} [timeout]           seconds
 * @property {number} [confirm]
 * @property {string[]} [only]
 * @property {string[]} [skip]
 * @property {string[]} [ignore]          regular expressions removed from output before comparing
 * @property {import('./perturbations.js').Perturbation[]} [perturbations]
 */

/**
 * Load shakeout.json from `cwd`, or from an explicit path. Missing default file is fine.
 * @param {string} cwd
 * @param {string} [explicit]
 * @returns {FileConfig}
 */
export function loadConfig(cwd, explicit) {
  const file = resolve(cwd, explicit ?? CONFIG_FILE);
  if (!existsSync(file)) {
    if (explicit) throw new Error(`config file not found: ${file}`);
    return {};
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${messageOf(err)}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  const allowed = ['compare', 'timeout', 'confirm', 'only', 'skip', 'ignore', 'perturbations', '$schema'];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) throw new Error(`${file}: unknown key "${key}"`);
  }
  if (raw.compare !== undefined && !['exit', 'output'].includes(raw.compare)) {
    throw new Error(`${file}: compare must be "exit" or "output"`);
  }
  return {
    compare: raw.compare,
    timeout: raw.timeout,
    confirm: raw.confirm,
    only: raw.only,
    skip: raw.skip,
    ignore: raw.ignore,
    perturbations: (raw.perturbations ?? []).map(validateCustom),
  };
}
