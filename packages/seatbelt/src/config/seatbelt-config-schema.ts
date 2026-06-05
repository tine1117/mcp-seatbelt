export const RECOMMENDED_CONFIG_SCHEMA_REF = "../docs/seatbelt.config.schema.json";

export const SEATBELT_CONFIG_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mcp-seatbelt.local/seatbelt.config.schema.json",
  "title": "mcp-seatbelt configuration",
  "description": "Local policy file for mcp-seatbelt doctor, wrap, and dashboard.",
  "markdownDescription": "Local policy file for **mcp-seatbelt** `doctor`, `wrap`, and dashboard.",
  "type": "object",
  "additionalProperties": false,
  "examples": [
    {
      "$schema": "../docs/seatbelt.config.schema.json",
      "mode": "protect",
      "root": ".",
      "allowlist": {
        "paths": ["../shared-readonly"]
      }
    }
  ],
  "properties": {
    "$schema": {
      "type": "string",
      "description": "Optional JSON schema reference for editor autocomplete.",
      "markdownDescription": "Optional JSON schema reference for editor autocomplete. Use `../docs/seatbelt.config.schema.json` in this repository.",
      "examples": ["../docs/seatbelt.config.schema.json"]
    },
    "mode": {
      "type": "string",
      "enum": ["observe", "protect", "strict"],
      "default": "protect",
      "description": "Runtime enforcement mode. CLI --mode overrides this value.",
      "markdownDescription": "Runtime enforcement mode. Use `protect` for normal local protection, `observe` for logging only, or `strict` to block medium risk calls.",
      "examples": ["protect"]
    },
    "root": {
      "type": "string",
      "default": ".",
      "description": "Trusted project root used by path traversal checks. Relative paths resolve from this config file.",
      "markdownDescription": "The trusted project root used by path traversal checks. Relative paths resolve from this config file.",
      "examples": ["."]
    },
    "allowlist": {
      "type": "object",
      "additionalProperties": false,
      "description": "Path traversal allowlist. It does not bypass sensitive-path, shell, metadata, or rug-pull rules.",
      "markdownDescription": "Path traversal allowlist. This only adds trusted roots for traversal checks; it does **not** bypass sensitive-path, destructive-shell, metadata-endpoint, or tool-rug-pull rules.",
      "examples": [
        {
          "paths": ["../shared-readonly"]
        }
      ],
      "properties": {
        "paths": {
          "type": "array",
          "default": [],
          "description": "Additional trusted roots for path traversal checks. Relative paths resolve from this config file.",
          "markdownDescription": "Additional trusted roots for path traversal checks. Relative paths resolve from this config file.",
          "examples": [["../shared-readonly"]],
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
} as const;
