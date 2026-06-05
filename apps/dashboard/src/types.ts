export type SeatbeltDecision = "allowed" | "blocked" | "redacted" | "error";

export interface SeatbeltEvent {
  schemaVersion: 1;
  runId: string;
  timestamp: string;
  direction: "client_to_server" | "server_to_client" | "internal";
  method?: string;
  toolName?: string;
  decision: SeatbeltDecision;
  ruleIds: string[];
  latencyMs?: number;
  reason?: string;
  severity?: "low" | "medium" | "high";
  messageRedacted: unknown;
}

export interface RunPointer {
  runId: string;
  path: string;
  startedAt: string;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  eventCount: number;
  allowedCount: number;
  blockedCount: number;
  redactedCount: number;
  errorCount: number;
}

export type SeatbeltMode = "observe" | "protect" | "strict";
export type SeatbeltConfigStatus = "missing" | "loaded" | "invalid-json" | "invalid-shape";
export type SeatbeltConfigSource = "cli" | "config" | "default";
export type SeatbeltSchemaStatus = "missing" | "matched" | "mismatched" | "unknown";

export interface DashboardConfig {
  path: string;
  status: SeatbeltConfigStatus;
  effective: {
    mode: SeatbeltMode;
    root: string;
    allowlist: {
      paths: string[];
    };
  };
  sources: {
    mode: SeatbeltConfigSource;
    root: SeatbeltConfigSource;
    allowlist: Exclude<SeatbeltConfigSource, "cli">;
  };
  schema: {
    expected: "../docs/seatbelt.config.schema.json";
    declared?: string;
    status: SeatbeltSchemaStatus;
  };
  error?: string;
}

export type DecisionFilter = "all" | SeatbeltDecision;
