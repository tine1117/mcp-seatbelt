import type { JsonRpcMessage } from "./json-rpc.js";

export type SeatbeltDirection = "client_to_server" | "server_to_client" | "internal";
export type SeatbeltDecision = "allowed" | "blocked" | "redacted" | "error";

export interface SeatbeltEvent {
  schemaVersion: 1;
  runId: string;
  timestamp: string;
  direction: SeatbeltDirection;
  method?: string;
  toolName?: string;
  decision: SeatbeltDecision;
  ruleIds: string[];
  latencyMs?: number;
  reason?: string;
  severity?: "low" | "medium" | "high";
  messageRedacted: JsonRpcMessage | Record<string, unknown> | string | null;
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
