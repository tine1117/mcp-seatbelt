# mcp-seatbelt

Seatbelt for MCP tools: local policy checks, audit logs, and a dashboard for safer AI tool use.

`mcp-seatbelt` wraps a stdio MCP server. It watches live JSON-RPC traffic, redacts secrets, blocks high-risk tool calls, and writes replayable JSONL logs on your machine.

## Quick Start

```bash
npx mcp-seatbelt wrap -- npx @modelcontextprotocol/server-filesystem ~/projects
```

Run with the local dashboard:

```bash
npx mcp-seatbelt wrap --dashboard -- npx @modelcontextprotocol/server-filesystem ~/projects
```

Inspect MCP client configs without editing them:

```bash
npx mcp-seatbelt doctor
npx mcp-seatbelt doctor --json
npx mcp-seatbelt doctor --json --fail-on unprotected
```

Print a copyable client config:

```bash
npx mcp-seatbelt config example --client claude-desktop
```

## What it blocks

- Sensitive paths such as `.env`, encoded secret paths, and traversal attempts.
- Destructive shell commands, nested shell execution, and pipe-to-shell patterns.
- Cloud metadata endpoints, including AWS, Azure, and Google metadata hosts.
- Tool schema rug pulls where an existing MCP tool changes shape at runtime.

## Config

```json
{
  "$schema": "./docs/seatbelt.config.schema.json",
  "mode": "protect",
  "root": ".",
  "allowlist": {
    "paths": ["../shared-readonly"]
  }
}
```

Use it with wrap:

```bash
npx mcp-seatbelt wrap --config ./seatbelt.config.json -- npx @modelcontextprotocol/server-filesystem ~/projects
```

The npm package includes `docs/seatbelt.config.schema.json` and `examples/seatbelt.config.json`.

## Commands

```bash
npx mcp-seatbelt wrap --help
npx mcp-seatbelt doctor --help
npx mcp-seatbelt config schema
npx mcp-seatbelt replay latest
```

## Privacy

`mcp-seatbelt` runs locally. It does not require an account and does not send telemetry.

## Links

- Repository: https://github.com/tine1117/mcp-seatbelt
- Issues: https://github.com/tine1117/mcp-seatbelt/issues
