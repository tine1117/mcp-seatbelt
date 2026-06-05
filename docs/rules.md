# mcp-seatbelt Built-In Rules

For false positive and false negative coverage, see [Security Rule Test Matrix](./security-rule-test-matrix.md).

## Modes

- `observe`: collect rule hits without blocking
- `protect`: block high risk hits
- `strict`: block high and medium risk hits

## Request Rules

### `sensitive-path`

Blocks access to sensitive local paths:

- `.env`, `.env.*`
- `.ssh`
- `.aws`
- `.npmrc`
- `.config/gh`
- `id_rsa`, `id_ed25519`
- private key file names

HTTP(S) documentation URLs are not treated as local sensitive paths. Metadata endpoint detection still applies to URLs.
Documentation-style filenames such as `private-key-rotation.md` are not treated as private key files.

### `destructive-shell`

Blocks common destructive shell patterns:

- `rm -rf`
- `del /s` and `del /q`
- `rmdir /s`
- `Remove-Item -Recurse -Force`
- `mkfs`
- `format C:`
- `curl | sh`
- `Invoke-WebRequest`, `Invoke-RestMethod`, `iwr`, and `irm` piped to `iex`
- `chmod 777`

Quoted examples printed by commands such as `echo` and `printf` are not treated as executed destructive commands.

### `path-traversal`

Flags `../`, URL-encoded traversal segments, and paths that resolve outside the configured root.

`seatbelt.config.json` can add read-only trusted roots for this check:

```json
{
  "allowlist": {
    "paths": ["../shared-readonly"]
  }
}
```

`allowlist.paths` only affects path traversal trusted-root checks. It does not bypass `sensitive-path`, `destructive-shell`, `metadata-endpoint`, or `tool-rug-pull`.

### `metadata-endpoint`

Blocks access to cloud metadata hosts:

- `169.254.169.254`, including percent-encoded, decimal, octal, hex, and IPv6-mapped forms
- AWS IMDS IPv6 endpoint `fd00:ec2::254`
- Google Cloud metadata host `metadata.google.internal`

## Response Rules

### `tool-rug-pull`

The first `tools/list` response is hashed by tool name, description, and input schema. Later schema changes are blocked in protect and strict modes.

## Redaction

The redaction engine masks:

- OpenAI keys
- Anthropic keys
- GitHub tokens
- AWS access keys
- Supabase tokens
- Vercel tokens
- bearer tokens
- private key blocks
- `.env` style key values
- token-like URL query parameters
