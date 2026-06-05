# mcp-seatbelt Threat Model

## Assets

- local files and credentials
- MCP tool arguments and responses
- MCP server tool schemas
- JSONL audit trail
- user trust in the AI client runtime path

## Attacker Goals

- read sensitive local paths such as `.env`, `.ssh`, `.aws`, `.npmrc`, and GitHub CLI config
- execute destructive shell commands
- exfiltrate credentials through tool responses
- mutate a safe-looking tool list after the session begins
- reach cloud metadata endpoints
- abuse path traversal to escape an intended project root

## MVP Controls

- block high-confidence dangerous `tools/call` arguments in protect mode
- redact secrets before writing logs or forwarding server responses
- hash initial `tools/list` schemas and block changed schemas later in the session
- write JSONL logs under `~/.mcp-seatbelt/runs`
- keep operational logs on stderr so stdout remains valid MCP JSON-RPC

## Non-Goals

- cloud scanning
- desktop app installation
- OAuth enforcement
- OPA/Rego policy language
- compliance reports
- sandboxing arbitrary child processes

## Residual Risk

`mcp-seatbelt` is a guardrail, not a sandbox. It cannot prove arbitrary tool behavior is safe, and it cannot stop a trusted MCP server from doing dangerous work internally after an allowed call. The first release focuses on high-signal local protection and transparent logs.
