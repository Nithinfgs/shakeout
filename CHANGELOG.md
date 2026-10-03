# Changelog

## 0.1.0

First release.

- 21 built-in perturbations across timezone, locale, HOME, paths, TMPDIR, terminal, CI variables,
  umask, thread pools, Python hash seed and (opt-in) network.
- Baseline run, then one run per perturbation; differences are re-run to separate real sensitivity
  from flakiness.
- `--compare exit|output`, with output normalisation (colour, paths, timestamps, durations) and
  `--ignore` patterns.
- Terminal, JSON and Markdown reports; copy-paste reproduction commands.
- `shakeout.json` for custom perturbations, default selection and timeouts.
