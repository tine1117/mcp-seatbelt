# Security Policy

`mcp-seatbelt` is a local runtime guard for MCP tool calls. Security reports are useful even when the issue looks small, especially if it can cause a missed block, an unsafe allow, a secret leak in logs, or unsafe dashboard file serving.

## Supported Versions

The current public release line is supported. Older versions may receive fixes when the impact is high and the patch is low risk.

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Use GitHub's private vulnerability reporting flow if it is enabled on the repository. If it is not available, open a minimal issue asking for a private security contact without including exploit details.

Helpful details:

- affected version or commit;
- operating system and Node.js version;
- exact command or MCP message shape;
- expected decision and actual decision;
- whether any secret was written to disk or printed to stdout/stderr.

## Scope

In scope:

- bypasses in sensitive path, destructive shell, metadata endpoint, traversal, or tool rug-pull rules;
- redaction misses for common token formats;
- dashboard static file traversal or unsafe API behavior;
- packed npm artifact mistakes that expose local files.

Out of scope:

- issues in third-party MCP servers when `mcp-seatbelt` is not involved;
- social engineering;
- denial-of-service reports without a practical local impact.
