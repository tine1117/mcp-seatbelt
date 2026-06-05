import type { LoadedSeatbeltConfig, ResolvedSeatbeltOptions } from "../config/seatbelt-config.js";

export type ParseStatus = "missing" | "ok" | "invalid-json" | "invalid-shape";
export type DoctorRisk = "unprotected" | "unpinned-npx" | "filesystem-wide-root" | "shell-capable" | "invalid-shape";
export type DoctorFailCondition = "risk" | "invalid-config" | "unprotected";

export interface RunDoctorOptions {
  json?: boolean;
  configPath?: string;
  failOn?: DoctorFailCondition[];
}

export interface ConfigCandidate {
  client: string;
  path: string;
}

export interface LoadedConfigCandidate extends ConfigCandidate {
  exists: boolean;
  parseStatus: ParseStatus;
  parseError?: string;
  parsed?: Record<string, unknown>;
}

export interface DiagnosedConfig extends LoadedConfigCandidate {
  servers: DiagnosedServer[];
}

export interface DiagnosedServer {
  name: string;
  command: string;
  args: string[];
  protected: boolean;
  risks: DoctorRiskFinding[];
  invalid: boolean;
  wrapSnippet?: Record<string, unknown>;
}

export interface DoctorRiskFinding {
  id: DoctorRisk;
  guide: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  generatedAt: string;
  seatbeltConfig: {
    path: string;
    status: LoadedSeatbeltConfig["status"];
    effective: {
      mode: ResolvedSeatbeltOptions["mode"];
      root: string;
      allowlist: { paths: string[] };
    };
    sources: ResolvedSeatbeltOptions["sources"];
    error?: string;
  };
  mcpConfigs: DiagnosedConfig[];
  summary: {
    configCount: number;
    serverCount: number;
    protectedCount: number;
    unprotectedCount: number;
    riskCount: number;
    invalidConfigCount: number;
  };
}
