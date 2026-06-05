# Contributing

Thanks for taking a look at `mcp-seatbelt`.

This project is still small, so the best contributions are focused: a failing rule fixture, a clear doctor discovery case, a dashboard regression, or a small documentation fix.

## Local Setup

```bash
corepack pnpm install
corepack pnpm test:all
corepack pnpm typecheck
corepack pnpm build
```

Run the smoke checks before opening a release-facing pull request:

```bash
corepack pnpm smoke:dashboard
corepack pnpm smoke:pack
```

## Pull Requests

- Keep public CLI behavior, config schema, JSONL event schema, and dashboard API response shapes compatible unless the change is explicitly about a breaking release.
- Add a nearby benign test case when adding a dangerous security-rule fixture.
- Keep source comments in English.
- Do not commit local run logs, dashboard state, package tarballs, or personal MCP client config files.

## Rule Changes

For security rules, prefer small fixtures that show the exact behavior:

- one malicious input that should block;
- one nearby benign input that should pass;
- one short reason in the test name or fixture label.

Update `docs/security-rule-test-matrix.md` when a gap moves to covered or becomes a documented residual risk.

## Reporting Bugs

Please include:

- the command you ran;
- your OS and Node.js version;
- whether the issue happens with `--mode observe`, `--mode protect`, or `--mode strict`;
- a redacted MCP message or log excerpt when possible.
