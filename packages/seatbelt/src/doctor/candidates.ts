import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigCandidate, LoadedConfigCandidate } from "./types.js";

export function discoverConfigCandidates(env: NodeJS.ProcessEnv): ConfigCandidate[] {
  const home = env.HOME || env.USERPROFILE || "";
  const appData = env.APPDATA || "";
  const xdgConfig = env.XDG_CONFIG_HOME || (home ? join(home, ".config") : "");
  const candidates: ConfigCandidate[] = [];

  addCandidate(candidates, "Claude Desktop (Windows)", appData, "Claude", "claude_desktop_config.json");
  addCandidate(candidates, "Claude Desktop (macOS)", home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  addCandidate(candidates, "Claude Desktop (Linux)", xdgConfig, "Claude", "claude_desktop_config.json");

  addCandidate(candidates, "Cursor", home, ".cursor", "mcp.json");
  addCandidate(candidates, "Cursor (Windows user)", appData, "Cursor", "User", "mcp.json");
  addCandidate(candidates, "Cursor (macOS user)", home, "Library", "Application Support", "Cursor", "User", "mcp.json");
  addCandidate(candidates, "Cursor (XDG user)", xdgConfig, "Cursor", "User", "mcp.json");

  addCandidate(candidates, "Codex", home, ".codex", "mcp.json");
  addCandidate(candidates, "Codex (XDG user)", xdgConfig, "codex", "mcp.json");

  addCandidate(candidates, "VS Code", home, ".vscode", "mcp.json");
  addCandidate(candidates, "VS Code (Windows user)", appData, "Code", "User", "mcp.json");
  addCandidate(candidates, "VS Code Insiders (Windows user)", appData, "Code - Insiders", "User", "mcp.json");
  addCandidate(candidates, "VS Code (macOS user)", home, "Library", "Application Support", "Code", "User", "mcp.json");
  addCandidate(candidates, "VS Code Insiders (macOS user)", home, "Library", "Application Support", "Code - Insiders", "User", "mcp.json");
  addCandidate(candidates, "VS Code (XDG user)", xdgConfig, "Code", "User", "mcp.json");
  addCandidate(candidates, "VS Code Insiders (XDG user)", xdgConfig, "Code - Insiders", "User", "mcp.json");

  return dedupeCandidates(candidates);
}

export function loadConfigCandidate(candidate: ConfigCandidate): LoadedConfigCandidate {
  if (!existsSync(candidate.path)) {
    return { ...candidate, exists: false, parseStatus: "missing" };
  }

  try {
    const parsed = JSON.parse(readFileSync(candidate.path, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return { ...candidate, exists: true, parseStatus: "invalid-shape", parsed: {} };
    }
    return { ...candidate, exists: true, parseStatus: "ok", parsed };
  } catch (error) {
    const parseError = error instanceof Error ? error.message : "unknown parse error";
    return { ...candidate, exists: true, parseStatus: "invalid-json", parseError };
  }
}

function addCandidate(candidates: ConfigCandidate[], client: string, basePath: string, ...parts: string[]): void {
  if (!basePath) {
    return;
  }
  candidates.push({ client, path: join(basePath, ...parts) });
}

function dedupeCandidates(candidates: ConfigCandidate[]): ConfigCandidate[] {
  const seen = new Set<string>();
  const deduped: ConfigCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.path.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }
  return deduped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
