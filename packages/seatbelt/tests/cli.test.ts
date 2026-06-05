import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "../src/logging/event-store.js";
import { runCli } from "../src/cli/index.js";

describe("CLI", () => {
  it("prints copyable Claude Desktop config JSON", async () => {
    const io = createIo();
    const code = await runCli(["node", "mcp-seatbelt", "config", "example", "--client", "claude-desktop"], io);

    expect(code).toBe(0);
    const config = JSON.parse(io.stdoutText());
    expect(config.mcpServers.filesystem.command).toBe("mcp-seatbelt");
    expect(config.mcpServers.filesystem.args).toEqual([
      "wrap",
      "--",
      "npx",
      "@modelcontextprotocol/server-filesystem",
      "~/projects"
    ]);
  });

  it("prints the seatbelt config JSON schema", async () => {
    const io = createIo();
    const code = await runCli(["node", "mcp-seatbelt", "config", "schema"], io);
    const cliSchema = JSON.parse(io.stdoutText());
    const docsSchema = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "docs", "seatbelt.config.schema.json"), "utf8"));

    expect(code).toBe(0);
    expect(cliSchema).toEqual(docsSchema);
    expect(cliSchema.properties.mode.enum).toEqual(["observe", "protect", "strict"]);
  });

  it("doctor succeeds when no known MCP configs exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-empty-home-"));
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root });
    const code = await runCli(["node", "mcp-seatbelt", "doctor"], io);

    expect(code).toBe(0);
    expect(io.stdoutText()).toContain("No MCP configs found");
    expect(io.stdoutText()).toContain("Checked common config locations");
    expect(io.stdoutText()).toContain("No files were modified");
  });

  it("doctor discovers OS-specific MCP config candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-discovery-"));
    const appData = join(root, "AppData", "Roaming");
    const xdgConfig = join(root, ".config");
    await writeConfigAt(join(root, "Library", "Application Support", "Claude", "claude_desktop_config.json"), {
      mcpServers: {
        macFilesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
        }
      }
    });
    await writeConfigAt(join(xdgConfig, "Cursor", "User", "mcp.json"), {
      mcpServers: {
        cursorFilesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
        }
      }
    });
    await writeConfigAt(join(appData, "Code", "User", "mcp.json"), {
      mcpServers: {
        vscodeFilesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
        }
      }
    });

    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: appData, XDG_CONFIG_HOME: xdgConfig });
    const code = await runCli(["node", "mcp-seatbelt", "doctor"], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("Claude Desktop (macOS)");
    expect(output).toContain("Cursor (XDG user)");
    expect(output).toContain("VS Code (Windows user)");
    expect(output).toContain("protected server macFilesystem");
    expect(output).toContain("protected server cursorFilesystem");
    expect(output).toContain("protected server vscodeFilesystem");
  });

  it("doctor reports unprotected servers with risks and copyable wrap snippets", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-home-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "~"]
        },
        shell: {
          command: "bash",
          args: ["-lc", "echo ok"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root });
    const code = await runCli(["node", "mcp-seatbelt", "doctor"], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("MCP config diagnosis");
    expect(output).toContain("Claude Desktop");
    expect(output).toContain("unprotected server filesystem: npx @modelcontextprotocol/server-filesystem ~");
    expect(output).toContain("risk: unprotected");
    expect(output).toContain("fix: Wrap this server with mcp-seatbelt.");
    expect(output).toContain("risk: unpinned-npx");
    expect(output).toContain("fix: Pin the package version, for example package@version.");
    expect(output).toContain("risk: filesystem-wide-root");
    expect(output).toContain("fix: Use a narrower project directory instead of a home or filesystem root.");
    expect(output).toContain('"command": "mcp-seatbelt"');
    expect(output).toContain('"args": [');
    expect(output).toContain('"wrap"');
    expect(output).toContain("unprotected server shell: bash -lc echo ok");
    expect(output).toContain("risk: shell-capable");
    expect(output).toContain("fix: Keep this wrapped and prefer observe mode first before trusting shell-capable tools.");
  });

  it("doctor --json emits parseable JSON with config, MCP configs, summary, and risk guides", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-json-"));
    const configPath = join(root, "seatbelt.config.json");
    await writeFile(configPath, JSON.stringify({ mode: "strict", root: ".", allowlist: { paths: ["shared"] } }, null, 2));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "~"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--json", "--config", configPath], io);
    const output = io.stdoutText();
    const report = JSON.parse(output);

    expect(code).toBe(0);
    expect(output).not.toContain("MCP config diagnosis");
    expect(report.schemaVersion).toBe(1);
    expect(report.seatbeltConfig.status).toBe("loaded");
    expect(report.seatbeltConfig.effective.mode).toBe("strict");
    expect(report.seatbeltConfig.effective.allowlist.paths).toEqual([join(root, "shared")]);
    expect(report.mcpConfigs[0].servers[0].risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "unprotected", guide: "Wrap this server with mcp-seatbelt." }),
      expect.objectContaining({ id: "filesystem-wide-root" })
    ]));
    expect(report.summary).toMatchObject({
      configCount: 1,
      serverCount: 1,
      protectedCount: 0,
      unprotectedCount: 1
    });
  });

  it("doctor --json --fail-on-risk keeps JSON stdout and returns a CI-friendly non-zero exit code", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-fail-on-risk-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "~"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--json", "--fail-on-risk"], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(2);
    expect(io.stderrText()).toBe("");
    expect(report.summary.riskCount).toBeGreaterThan(0);
    expect(report.mcpConfigs[0].servers[0].risks[0]).toMatchObject({
      id: "unprotected",
      guide: "Wrap this server with mcp-seatbelt."
    });
  });

  it("doctor --json --fail-on invalid-config fails when MCP configs cannot be parsed", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-fail-invalid-config-"));
    await writeClaudeConfig(root, "{ invalid json");
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--json", "--fail-on", "invalid-config"], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(2);
    expect(io.stderrText()).toBe("");
    expect(report.summary.invalidConfigCount).toBe(1);
    expect(report.mcpConfigs[0].parseStatus).toBe("invalid-json");
  });

  it("doctor --json --fail-on risk --fail-on invalid-config combines CI failure conditions", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-fail-combined-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "~"]
        },
        broken: "npx @modelcontextprotocol/server-filesystem"
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli([
      "node",
      "mcp-seatbelt",
      "doctor",
      "--json",
      "--fail-on",
      "risk",
      "--fail-on",
      "invalid-config"
    ], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(2);
    expect(report.summary.riskCount).toBeGreaterThan(0);
    expect(report.summary.invalidConfigCount).toBe(1);
  });

  it("doctor --json --fail-on unprotected fails only when unprotected servers exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-fail-unprotected-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem@1.0.0", "~/projects"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--json", "--fail-on", "unprotected"], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(2);
    expect(io.stderrText()).toBe("");
    expect(report.summary.unprotectedCount).toBe(1);
    expect(report.summary.riskCount).toBe(1);
  });

  it("doctor --json --fail-on unprotected passes when every valid server is protected", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-pass-protected-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--json", "--fail-on", "unprotected"], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(0);
    expect(report.summary.unprotectedCount).toBe(0);
    expect(report.summary.protectedCount).toBe(1);
  });

  it("doctor --json combines unprotected and invalid-config failure conditions", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-fail-unprotected-invalid-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem@1.0.0", "~/projects"]
        },
        broken: "not an object"
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root }, undefined, root);
    const code = await runCli([
      "node",
      "mcp-seatbelt",
      "doctor",
      "--json",
      "--fail-on",
      "unprotected",
      "--fail-on",
      "invalid-config"
    ], io);
    const report = JSON.parse(io.stdoutText());

    expect(code).toBe(2);
    expect(report.summary.unprotectedCount).toBe(1);
    expect(report.summary.invalidConfigCount).toBe(1);
  });

  it("doctor fails for unsupported --fail-on conditions", async () => {
    const io = createIo();
    const code = await runCli(["node", "mcp-seatbelt", "doctor", "--fail-on", "unknown"], io);

    expect(code).toBe(1);
    expect(io.stdoutText()).toBe("");
    expect(io.stderrText()).toContain("Unsupported fail condition: unknown");
  });

  it("doctor does not suggest wrapping already protected servers", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-protected-"));
    await writeClaudeConfig(root, {
      mcpServers: {
        filesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
        }
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root });
    const code = await runCli(["node", "mcp-seatbelt", "doctor"], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("protected server filesystem: mcp-seatbelt wrap -- npx @modelcontextprotocol/server-filesystem ~/projects");
    expect(output).not.toContain("copy-paste wrap snippet");
  });

  it("doctor reports invalid JSON and invalid server shapes without failing the command", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-invalid-"));
    await writeClaudeConfig(root, "{ invalid json");
    await writeCodexConfig(root, {
      mcpServers: {
        broken: "npx @modelcontextprotocol/server-filesystem"
      }
    });
    const io = createIo({ HOME: root, USERPROFILE: root, APPDATA: root });
    const code = await runCli(["node", "mcp-seatbelt", "doctor"], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("Claude Desktop");
    expect(output).toContain("unable to parse JSON");
    expect(output).toContain("Codex");
    expect(output).toContain("invalid server broken");
    expect(output).toContain("risk: invalid-shape");
    expect(output).toContain("fix: Use an object with a string command and optional string args array.");
  });

  it("wrap uses config mode when CLI mode is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-wrap-config-"));
    const configPath = join(root, "seatbelt.config.json");
    await writeFile(configPath, JSON.stringify({ mode: "strict", root }));
    const io = createIo({}, traversalRequest(), root);
    const code = await runCli(["node", "mcp-seatbelt", "wrap", "--config", configPath, "--", process.execPath, "-e", echoStdinScript()], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain("Blocked by mcp-seatbelt");
  });

  it("wrap CLI mode overrides config mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-wrap-override-"));
    const configPath = join(root, "seatbelt.config.json");
    await writeFile(configPath, JSON.stringify({ mode: "strict", root }));
    const io = createIo({}, traversalRequest(), root);
    const code = await runCli(["node", "mcp-seatbelt", "wrap", "--config", configPath, "--mode", "observe", "--", process.execPath, "-e", echoStdinScript()], io);
    const output = io.stdoutText();

    expect(code).toBe(0);
    expect(output).toContain('"method":"tools/call"');
    expect(output).not.toContain("Blocked by mcp-seatbelt");
  });

  it("wrap fails for explicit missing or invalid config files", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-wrap-bad-config-"));
    const missingIo = createIo({}, "", root);
    const missingCode = await runCli(["node", "mcp-seatbelt", "wrap", "--config", join(root, "missing.json"), "--", process.execPath, "-e", echoStdinScript()], missingIo);

    const invalidConfigPath = join(root, "invalid.json");
    await writeFile(invalidConfigPath, JSON.stringify({ mode: "paranoid" }));
    const invalidIo = createIo({}, "", root);
    const invalidCode = await runCli(["node", "mcp-seatbelt", "wrap", "--config", invalidConfigPath, "--", process.execPath, "-e", echoStdinScript()], invalidIo);

    expect(missingCode).toBe(1);
    expect(missingIo.stderrText()).toContain("Seatbelt config not found");
    expect(invalidCode).toBe(1);
    expect(invalidIo.stderrText()).toContain("Invalid seatbelt config");
  });

  it("replays the latest JSONL run", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-replay-"));
    const store = await JsonlEventStore.create({ rootDir: root, runId: "replay-run" });
    await store.append({
      schemaVersion: 1,
      runId: "replay-run",
      timestamp: "2026-06-05T00:00:00.000Z",
      direction: "client_to_server",
      method: "tools/list",
      decision: "allowed",
      ruleIds: [],
      messageRedacted: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    await store.close();

    const io = createIo();
    const code = await runCli(["node", "mcp-seatbelt", "replay", "latest", "--root-dir", root], io);

    expect(code).toBe(0);
    expect(io.stdoutText()).toContain("replay-run");
    expect(io.stdoutText()).toContain("tools/list");
    expect(io.stdoutText()).toContain("allowed");
  });

  it("runs the built-in demo with allowed, blocked, and redacted scenarios", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-demo-"));
    const io = createIo();
    const code = await runCli(["node", "mcp-seatbelt", "demo", "--root-dir", root], io);

    expect(code).toBe(0);
    expect(io.stdoutText()).toContain("allowed");
    expect(io.stdoutText()).toContain("blocked");
    expect(io.stdoutText()).toContain("redacted");
  });
});

function createIo(extraEnv: NodeJS.ProcessEnv = {}, stdinText = "", cwd = process.cwd()) {
  let stdout = "";
  let stderr = "";
  return {
    stdin: Readable.from(stdinText ? [stdinText] : []),
    stdout: { write: (chunk: string | Buffer) => { stdout += chunk.toString(); return true; } },
    stderr: { write: (chunk: string | Buffer) => { stderr += chunk.toString(); return true; } },
    env: { ...process.env, ...extraEnv },
    cwd,
    stdoutText: () => stdout,
    stderrText: () => stderr
  };
}

async function writeClaudeConfig(root: string, contents: unknown): Promise<void> {
  const configDir = join(root, "Claude");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "claude_desktop_config.json"), typeof contents === "string" ? contents : JSON.stringify(contents, null, 2));
}

async function writeCodexConfig(root: string, contents: unknown): Promise<void> {
  const configDir = join(root, ".codex");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "mcp.json"), JSON.stringify(contents, null, 2));
}

async function writeConfigAt(path: string, contents: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(contents, null, 2));
}

function traversalRequest(): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "read_file",
      arguments: { path: "../outside.txt" }
    }
  })}\n`;
}

function echoStdinScript(): string {
  return "process.stdin.pipe(process.stdout)";
}
