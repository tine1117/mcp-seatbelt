import type { LoadedSeatbeltConfig, ResolvedSeatbeltOptions } from "../config/seatbelt-config.js";
import type {
  DiagnosedConfig,
  DiagnosedServer,
  DoctorFailCondition,
  DoctorReport,
  DoctorRisk,
  DoctorRiskFinding,
  LoadedConfigCandidate
} from "./types.js";

const RISK_GUIDES: Record<DoctorRisk, string> = {
  "unprotected": "Wrap this server with mcp-seatbelt.",
  "unpinned-npx": "Pin the package version, for example package@version.",
  "filesystem-wide-root": "Use a narrower project directory instead of a home or filesystem root.",
  "shell-capable": "Keep this wrapped and prefer observe mode first before trusting shell-capable tools.",
  "invalid-shape": "Use an object with a string command and optional string args array."
};

export function diagnoseConfig(config: LoadedConfigCandidate): DiagnosedConfig {
  if (config.parseStatus !== "ok" || !config.parsed) {
    return { ...config, servers: [] };
  }

  const rawServers = isRecord(config.parsed.mcpServers) ? config.parsed.mcpServers : {};
  const servers = Object.entries(rawServers).map(([name, rawServer]) => diagnoseServer(name, rawServer));
  return { ...config, servers };
}

export function diagnoseServer(name: string, rawServer: unknown): DiagnosedServer {
  if (!isRecord(rawServer) || typeof rawServer.command !== "string") {
    return {
      name,
      command: "",
      args: [],
      protected: false,
      risks: [createRisk("invalid-shape")],
      invalid: true
    };
  }

  const command = rawServer.command;
  const args = Array.isArray(rawServer.args) ? rawServer.args.map(String) : [];
  const protectedBySeatbelt = command === "mcp-seatbelt" || args.includes("mcp-seatbelt");
  const risks = collectRisks(command, args, protectedBySeatbelt).map(createRisk);

  return {
    name,
    command,
    args,
    protected: protectedBySeatbelt,
    risks,
    invalid: false,
    wrapSnippet: protectedBySeatbelt ? undefined : createWrapSnippet(command, args)
  };
}

export function createDoctorReport(
  seatbeltConfig: LoadedSeatbeltConfig,
  effectiveOptions: ResolvedSeatbeltOptions,
  mcpConfigs: DiagnosedConfig[]
): DoctorReport {
  const servers = mcpConfigs.flatMap((config) => config.servers);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seatbeltConfig: {
      path: seatbeltConfig.path,
      status: seatbeltConfig.status,
      effective: {
        mode: effectiveOptions.mode,
        root: effectiveOptions.root,
        allowlist: {
          paths: effectiveOptions.allowlistPaths
        }
      },
      sources: effectiveOptions.sources,
      error: seatbeltConfig.error
    },
    mcpConfigs,
    summary: {
      configCount: mcpConfigs.length,
      serverCount: servers.length,
      protectedCount: servers.filter((server) => server.protected).length,
      unprotectedCount: servers.filter((server) => !server.protected && !server.invalid).length,
      riskCount: servers.reduce((count, server) => count + server.risks.length, 0),
      invalidConfigCount: countInvalidConfigs(mcpConfigs, servers)
    }
  };
}

export function shouldFailDoctor(report: DoctorReport, failOn: DoctorFailCondition[]): boolean {
  const conditions = new Set(failOn);
  return (
    (conditions.has("risk") && report.summary.riskCount > 0) ||
    (conditions.has("invalid-config") && report.summary.invalidConfigCount > 0) ||
    (conditions.has("unprotected") && report.summary.unprotectedCount > 0)
  );
}

export function toJsonReport(report: DoctorReport): DoctorReport {
  return {
    ...report,
    mcpConfigs: report.mcpConfigs.map((config) => ({
      client: config.client,
      path: config.path,
      exists: config.exists,
      parseStatus: config.parseStatus,
      parseError: config.parseError,
      servers: config.servers
    }))
  };
}

function collectRisks(command: string, args: string[], protectedBySeatbelt: boolean): DoctorRisk[] {
  const risks: DoctorRisk[] = [];
  if (!protectedBySeatbelt) {
    risks.push("unprotected");
  }
  if (isUnpinnedNpx(command, args)) {
    risks.push("unpinned-npx");
  }
  if (hasFilesystemWideRoot(command, args)) {
    risks.push("filesystem-wide-root");
  }
  if (isShellCapable(command, args)) {
    risks.push("shell-capable");
  }
  return risks;
}

function isUnpinnedNpx(command: string, args: string[]): boolean {
  if (command !== "npx") {
    return false;
  }

  const packageSpec = args.find((arg) => !arg.startsWith("-"));
  if (!packageSpec) {
    return false;
  }
  return !hasPinnedPackageVersion(packageSpec);
}

function hasPinnedPackageVersion(packageSpec: string): boolean {
  if (packageSpec.startsWith("@")) {
    const slashIndex = packageSpec.indexOf("/");
    return slashIndex !== -1 && packageSpec.indexOf("@", slashIndex) !== -1;
  }
  return packageSpec.includes("@");
}

function hasFilesystemWideRoot(command: string, args: string[]): boolean {
  const joined = [command, ...args].join(" ").toLowerCase();
  if (!joined.includes("server-filesystem")) {
    return false;
  }
  return args.some((arg) => arg === "~" || arg === "/" || arg === "\\" || /^[a-zA-Z]:\\?$/.test(arg));
}

function isShellCapable(command: string, args: string[]): boolean {
  const shellTerms = ["shell", "terminal", "powershell", "cmd", "bash", "sh"];
  return [command, ...args].some((value) => {
    const normalized = value.toLowerCase();
    return shellTerms.some((term) => normalized.includes(term));
  });
}

function createWrapSnippet(command: string, args: string[]): Record<string, unknown> {
  return {
    command: "mcp-seatbelt",
    args: ["wrap", "--", command, ...args]
  };
}

function countInvalidConfigs(mcpConfigs: DiagnosedConfig[], servers: DiagnosedServer[]): number {
  return mcpConfigs.filter((config) => config.parseStatus !== "ok").length + servers.filter((server) => server.invalid).length;
}

function createRisk(id: DoctorRisk): DoctorRiskFinding {
  return { id, guide: RISK_GUIDES[id] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
