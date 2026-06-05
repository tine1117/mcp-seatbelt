import type { CliIo } from "../cli/io.js";
import { writeLine } from "../cli/io.js";
import { loadSeatbeltConfig, resolveSeatbeltOptions } from "../config/seatbelt-config.js";
import { discoverConfigCandidates, loadConfigCandidate } from "./candidates.js";
import { createDoctorReport, diagnoseConfig, shouldFailDoctor, toJsonReport } from "./diagnosis.js";
import { renderDoctorReport } from "./render.js";
import type { RunDoctorOptions } from "./types.js";

export type { DoctorFailCondition } from "./types.js";

export async function runDoctor(io: CliIo, options: RunDoctorOptions = {}): Promise<number> {
  const seatbeltConfig = loadSeatbeltConfig({ cwd: io.cwd, configPath: options.configPath, explicit: Boolean(options.configPath) });
  const effectiveOptions = resolveSeatbeltOptions(seatbeltConfig);
  const candidates = discoverConfigCandidates(io.env);
  const loadedConfigs = candidates.map((candidate) => loadConfigCandidate(candidate));
  const foundConfigs = loadedConfigs.filter((config) => config.exists);
  const mcpConfigs = foundConfigs.map(diagnoseConfig);
  const report = createDoctorReport(seatbeltConfig, effectiveOptions, mcpConfigs);
  const exitCode = shouldFailDoctor(report, options.failOn ?? []) ? 2 : 0;

  if (options.json) {
    writeLine(io.stdout, JSON.stringify(toJsonReport(report), null, 2));
    return exitCode;
  }

  if (mcpConfigs.length === 0) {
    writeLine(io.stdout, "No MCP configs found.");
    writeLine(io.stdout, "Checked common config locations for Claude Desktop, Cursor, Codex, and VS Code.");
    writeLine(io.stdout, "Run `mcp-seatbelt config example --client claude-desktop` to print a copyable starter config.");
    writeLine(io.stdout, "Paste the snippet into your MCP client's config file. No files were modified.");
    return exitCode;
  }

  renderDoctorReport(report, io);
  return exitCode;
}
