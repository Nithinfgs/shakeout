# Security policy

## What shakeout does

shakeout runs the command **you give it** repeatedly with modified environment variables, and for path
perturbations from a copy of your project in a temp directory. It makes no network requests of its own
and sends no telemetry. Treat it like any tool that runs your test command: only point it at code you
already trust to run.

Things worth knowing:

- Relocated checkouts are copies placed under your system temp directory and are deleted afterwards
  (unless `--keep`). `.git` is never copied and `node_modules` is symlinked, not copied.
- The environment passed to your command is your own, plus the perturbation. Secrets in your
  environment are visible to the command exactly as they would be without shakeout.
- `--verbose` and `--json` print excerpts of your command's output. Check them before pasting
  reports into public issues.

## Reporting a vulnerability

Please open a [private security advisory](https://github.com/Nithinfgs/shakeout/security/advisories/new)
rather than a public issue. You can expect an acknowledgement within a week.

## Supported versions

Only the latest release receives fixes.
