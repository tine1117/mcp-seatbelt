import type { CliIo } from "../cli/io.js";
import { writeLine } from "../cli/io.js";
import type { DiagnosedServer, DoctorReport } from "./types.js";

export function renderDoctorReport(report: DoctorReport, io: CliIo): void {
  writeLine(io.stdout, "MCP config diagnosis");
  writeLine(io.stdout, "");
  writeLine(io.stdout, `Seatbelt config: ${report.seatbeltConfig.path} (${report.seatbeltConfig.status})`);
  writeLine(io.stdout, `  mode: ${report.seatbeltConfig.effective.mode}`);
  writeLine(io.stdout, `  root: ${report.seatbeltConfig.effective.root}`);
  if (report.seatbeltConfig.effective.allowlist.paths.length > 0) {
    writeLine(io.stdout, `  allowlist.paths: ${report.seatbeltConfig.effective.allowlist.paths.join(", ")}`);
  }
  if (report.seatbeltConfig.error) {
    writeLine(io.stdout, `  error: ${report.seatbeltConfig.error}`);
  }

  for (const config of report.mcpConfigs) {
    writeLine(io.stdout, "");
    writeLine(io.stdout, `${config.client}: ${config.path}`);

    if (config.parseStatus === "invalid-json") {
      writeLine(io.stdout, `  unable to parse JSON: ${config.parseError ?? "unknown parse error"}`);
      continue;
    }
    if (config.parseStatus === "invalid-shape") {
      writeLine(io.stdout, "  unable to inspect: config root must be a JSON object");
      continue;
    }
    if (config.servers.length === 0) {
      writeLine(io.stdout, "  no mcpServers found");
      continue;
    }

    for (const server of config.servers) {
      renderServerDiagnosis(server, io);
    }
  }
}

function renderServerDiagnosis(server: DiagnosedServer, io: CliIo): void {
  if (server.invalid) {
    writeLine(io.stdout, `  invalid server ${server.name}`);
    for (const risk of server.risks) {
      writeLine(io.stdout, `    risk: ${risk.id}`);
      writeLine(io.stdout, `    fix: ${risk.guide}`);
    }
    return;
  }

  const status = server.protected ? "protected" : "unprotected";
  const commandLine = [server.command, ...server.args].join(" ");
  writeLine(io.stdout, `  ${status} server ${server.name}: ${commandLine}`.trimEnd());
  for (const risk of server.risks) {
    writeLine(io.stdout, `    risk: ${risk.id}`);
    writeLine(io.stdout, `    fix: ${risk.guide}`);
  }
  if (server.wrapSnippet) {
    writeLine(io.stdout, "    copy-paste wrap snippet:");
    writeLine(io.stdout, indent(JSON.stringify(server.wrapSnippet, null, 2), 6));
  }
}

function indent(value: string, spaces: number): string {
  const padding = " ".repeat(spaces);
  return value.split("\n").map((line) => `${padding}${line}`).join("\n");
}
