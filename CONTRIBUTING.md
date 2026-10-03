# Contributing

Thanks for helping. shakeout is small on purpose: zero runtime dependencies, Node 20+.

## Setup

```sh
git clone https://github.com/Nithinfgs/shakeout && cd shakeout
npm install        # dev tools only: biome, typescript, @types/node
npm run check      # lint + type-check + tests
npm run demo       # run shakeout against examples/demo-app
```

## The most useful contribution: a new perturbation

A perturbation is a realistic difference between environments that breaks real software.
Add one to `src/perturbations.js`:

```js
{
  id: 'tz-lord-howe',                     // unique, kebab-case
  category: 'tz',
  description: 'TZ=Australia/Lord_Howe (30-minute DST shift)',
  env: { TZ: 'Australia/Lord_Howe' },
  hint: 'Code assumes DST moves the clock by exactly one hour.',
}
```

A good perturbation:

1. **Is something people actually hit**, ideally with a link to an issue or write-up in the PR.
2. **Is safe**: no deleting files, no network calls, nothing outside the scratch directory.
3. **Has a hint** that says what a failure usually means and how to fix it.
4. **Is cheap**: it should not make every run slower.
5. Is **default** only if most projects can survive it. Use `optIn: true` for noisier ones.

The catalogue test (`test/perturbations.test.js`) checks ids, hints and effects automatically.

## Other things that help

- A bug report with the command you ran, `shakeout --json` output (trimmed), and your OS / Node version.
- A false positive: a perturbation flagged something that is not a real assumption. Those are bugs.
- Windows support (see the roadmap in the README).

## Pull requests

- Keep them focused; add or update tests.
- `npm run check` must pass. `npm run format` fixes style.
- Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
