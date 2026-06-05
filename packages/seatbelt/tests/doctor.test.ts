import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LoadedSeatbeltConfig, ResolvedSeatbeltOptions } from "../src/config/seatbelt-config.js";
import { discoverConfigCandidates, loadConfigCandidate } from "../src/doctor/candidates.js";
import { createDoctorReport, diagnoseConfig, shouldFailDoctor, toJsonReport } from "../src/doctor/diagnosis.js";

describe("doctor diagnosis pipeline", () => {
  it("discovers, loads, and diagnoses MCP configs without the CLI renderer", async () => {
    const root = await mkdtemp(join(tmpdir(), "seatbelt-doctor-pipeline-"));
    const appData = join(root, "AppData", "Roaming");
    const xdgConfig = join(root, ".config");
    const configPath = join(appData, "Claude", "claude_desktop_config.json");
    await mkdir(join(appData, "Claude"), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem", "~"]
        },
        protectedFilesystem: {
          command: "mcp-seatbelt",
          args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem@1.0.0", "~/projects"]
        },
        broken: "npx @modelcontextprotocol/server-filesystem"
      }
    }, null, 2));

    const candidates = discoverConfigCandidates({
      HOME: root,
      USERPROFILE: root,
      APPDATA: appData,
      XDG_CONFIG_HOME: xdgConfig
    });
    const loaded = candidates.map(loadConfigCandidate).find((candidate) => candidate.path === configPath);

    expect(loaded?.parseStatus).toBe("ok");

    const diagnosed = diagnoseConfig(loaded!);
    const filesystem = diagnosed.servers.find((server) => server.name === "filesystem");
    const protectedFilesystem = diagnosed.servers.find((server) => server.name === "protectedFilesystem");
    const broken = diagnosed.servers.find((server) => server.name === "broken");

    expect(filesystem).toMatchObject({
      protected: false,
      risks: expect.arrayContaining([
        expect.objectContaining({ id: "unprotected" }),
        expect.objectContaining({ id: "unpinned-npx" }),
        expect.objectContaining({ id: "filesystem-wide-root" })
      ]),
      wrapSnippet: {
        command: "mcp-seatbelt",
        args: ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~"]
      }
    });
    expect(protectedFilesystem).toMatchObject({ protected: true, risks: [] });
    expect(protectedFilesystem?.wrapSnippet).toBeUndefined();
    expect(broken).toMatchObject({
      invalid: true,
      risks: [expect.objectContaining({ id: "invalid-shape" })]
    });
  });

  it("builds JSON-safe reports and evaluates fail conditions from diagnosed configs", () => {
    const diagnosed = diagnoseConfig({
      client: "Claude Desktop",
      path: "/tmp/claude_desktop_config.json",
      exists: true,
      parseStatus: "ok",
      parsed: {
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem", "~"]
          }
        }
      }
    });
    const report = createDoctorReport(seatbeltConfig(), effectiveOptions(), [diagnosed]);
    const jsonReport = toJsonReport(report);

    expect(report.summary).toMatchObject({
      configCount: 1,
      serverCount: 1,
      protectedCount: 0,
      unprotectedCount: 1,
      invalidConfigCount: 0
    });
    expect(shouldFailDoctor(report, ["risk"])).toBe(true);
    expect(shouldFailDoctor(report, ["invalid-config"])).toBe(false);
    expect(jsonReport.mcpConfigs[0]).not.toHaveProperty("parsed");
  });
});

function seatbeltConfig(): LoadedSeatbeltConfig {
  return {
    path: "/tmp/seatbelt.config.json",
    cwd: "/tmp",
    baseDir: "/tmp",
    explicit: false,
    status: "missing"
  };
}

function effectiveOptions(): ResolvedSeatbeltOptions {
  return {
    mode: "protect",
    root: "/tmp",
    allowlistPaths: [],
    sources: {
      mode: "default",
      root: "default",
      allowlist: "default"
    }
  };
}
