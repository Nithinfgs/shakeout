#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  env: process.env,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`shakeout: unexpected error: ${err?.stack ?? err}`);
    process.exitCode = 2;
  },
);
