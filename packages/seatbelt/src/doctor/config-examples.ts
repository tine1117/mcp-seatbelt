export type SupportedClient = "claude-desktop" | "cursor" | "codex" | "vscode";

export function createConfigExample(client: SupportedClient): Record<string, unknown> {
  const server = {
    command: "mcp-seatbelt",
    args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
  };

  if (client === "codex") {
    return {
      mcpServers: {
        filesystem: server
      }
    };
  }

  return {
    mcpServers: {
      filesystem: server
    }
  };
}

export function parseSupportedClient(value: string): SupportedClient {
  if (value === "claude-desktop" || value === "cursor" || value === "codex" || value === "vscode") {
    return value;
  }
  throw new Error(`Unsupported client: ${value}`);
}
