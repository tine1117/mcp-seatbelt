import { redactValue } from "../redaction/redact.js";
import { createRuleEngine, type RuleDecision } from "../rules/engine.js";
import { createRuleState, type RuleState } from "../rules/state.js";
import type { SeatbeltDecision, SeatbeltEvent } from "../types/events.js";
import type { JsonRpcId, JsonRpcMessage } from "../types/json-rpc.js";
import type { SeatbeltMode } from "../types/options.js";
import { createJsonRpcError, parseJsonRpcLine } from "./json-rpc.js";

export interface SeatbeltMessageHandlerOptions {
  mode: SeatbeltMode;
  root: string;
  allowlistPaths: string[];
  runId: string;
  now?: () => number;
  softLimitBytes?: number;
  hardCapBytes?: number;
}

export interface SeatbeltHandlerEffect {
  clientMessage?: JsonRpcMessage;
  serverLine?: string;
  operationalLog?: string;
  event?: SeatbeltEvent;
}

const DEFAULT_SOFT_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_HARD_CAP_BYTES = 10 * 1024 * 1024;

export class SeatbeltMessageHandler {
  private readonly engine;
  private readonly state: RuleState = createRuleState();
  private readonly pendingMethods = new Map<string, string>();
  private readonly pendingStartedAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly softLimitBytes: number;
  private readonly hardCapBytes: number;

  constructor(private readonly options: SeatbeltMessageHandlerOptions) {
    this.engine = createRuleEngine({ mode: options.mode, root: options.root, allowlistPaths: options.allowlistPaths });
    this.now = options.now ?? Date.now;
    this.softLimitBytes = options.softLimitBytes ?? DEFAULT_SOFT_LIMIT_BYTES;
    this.hardCapBytes = options.hardCapBytes ?? DEFAULT_HARD_CAP_BYTES;
  }

  handleClientLine(line: string): SeatbeltHandlerEffect[] {
    let message: JsonRpcMessage;
    try {
      message = parseJsonRpcLine(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid client JSON-RPC frame";
      return [{
        clientMessage: createJsonRpcError(null, -32700, "Invalid JSON-RPC from client", { reason }),
        event: this.createEvent("client_to_server", "error", [], null, reason)
      }];
    }

    if (message.id !== undefined && message.id !== null && message.method) {
      const key = idKey(message.id);
      this.pendingMethods.set(key, message.method);
      this.pendingStartedAt.set(key, this.now());
    }

    const redacted = redactValue(message);
    const decision = this.engine.evaluateClientMessage(message, this.state);
    const toolName = extractToolName(message);
    if (decision.action === "block") {
      return [{
        clientMessage: createJsonRpcError(message.id, -32001, "Blocked by mcp-seatbelt", {
          ruleIds: decision.ruleIds,
          reasons: decision.reasons
        }),
        event: this.createEvent(
          "client_to_server",
          "blocked",
          decision.ruleIds,
          redacted.value,
          decision.reasons.join("; "),
          message.method,
          toolName,
          decision
        )
      }];
    }

    return [{
      serverLine: line,
      event: this.createEvent(
        "client_to_server",
        redacted.redacted ? "redacted" : "allowed",
        decision.ruleIds,
        redacted.value,
        decision.reasons.join("; ") || undefined,
        message.method,
        toolName,
        decision
      )
    }];
  }

  handleServerLine(line: string): SeatbeltHandlerEffect[] {
    const byteLength = Buffer.byteLength(line, "utf8");
    if (byteLength > this.hardCapBytes) {
      return [{
        clientMessage: createJsonRpcError(null, -32002, "MCP server frame exceeded mcp-seatbelt hard cap", {
          byteLength,
          hardCapBytes: this.hardCapBytes
        }),
        event: this.createEvent(
          "server_to_client",
          "error",
          ["response-hard-cap"],
          null,
          `server frame exceeded hard cap: ${byteLength} bytes`
        )
      }];
    }

    const effects: SeatbeltHandlerEffect[] = [];
    if (byteLength > this.softLimitBytes) {
      effects.push({
        event: this.createEvent(
          "internal",
          "allowed",
          ["response-soft-limit"],
          null,
          `large server frame observed: ${byteLength} bytes`
        )
      });
    }

    let message: JsonRpcMessage;
    try {
      message = parseJsonRpcLine(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid server JSON-RPC frame";
      effects.push({
        clientMessage: createJsonRpcError(null, -32700, "Invalid JSON-RPC from MCP server", { reason }),
        event: this.createEvent("server_to_client", "error", ["invalid-stdout"], null, reason)
      });
      return effects;
    }

    const key = message.id !== undefined && message.id !== null ? idKey(message.id) : undefined;
    const requestMethod = key ? this.pendingMethods.get(key) : undefined;
    const latencyMs = key && this.pendingStartedAt.has(key) ? this.now() - (this.pendingStartedAt.get(key) ?? this.now()) : undefined;
    if (message.id !== undefined && message.id !== null) {
      this.pendingMethods.delete(idKey(message.id));
      this.pendingStartedAt.delete(idKey(message.id));
    }

    const redacted = redactValue(message);
    const decision = this.engine.evaluateServerMessage(message, this.state, requestMethod);
    if (decision.action === "block") {
      effects.push({
        clientMessage: createJsonRpcError(message.id, -32001, "Blocked by mcp-seatbelt", {
          ruleIds: decision.ruleIds,
          reasons: decision.reasons
        }),
        event: this.createEvent(
          "server_to_client",
          "blocked",
          decision.ruleIds,
          redacted.value,
          decision.reasons.join("; "),
          requestMethod,
          undefined,
          decision,
          latencyMs
        )
      });
      return effects;
    }

    effects.push({
      clientMessage: redacted.value,
      event: this.createEvent(
        "server_to_client",
        redacted.redacted ? "redacted" : "allowed",
        decision.ruleIds,
        redacted.value,
        decision.reasons.join("; ") || undefined,
        requestMethod,
        undefined,
        decision,
        latencyMs
      )
    });
    return effects;
  }

  handleChildStderr(text: string): SeatbeltHandlerEffect[] {
    const redacted = redactValue(text.trim());
    return [{
      operationalLog: text,
      event: this.createEvent(
        "internal",
        redacted.redacted ? "redacted" : "allowed",
        [],
        redacted.value,
        "child stderr",
        "child/stderr"
      )
    }];
  }

  handleInternal(decision: SeatbeltDecision, method: string, reason: string): SeatbeltHandlerEffect[] {
    return [{ event: this.createEvent("internal", decision, [], null, reason, method) }];
  }

  private createEvent(
    direction: SeatbeltEvent["direction"],
    decision: SeatbeltDecision,
    ruleIds: string[],
    messageRedacted: SeatbeltEvent["messageRedacted"],
    reason?: string,
    method?: string,
    toolName?: string,
    ruleDecision?: RuleDecision,
    latencyMs?: number
  ): SeatbeltEvent {
    return {
      schemaVersion: 1,
      runId: this.options.runId,
      timestamp: new Date(this.now()).toISOString(),
      direction,
      method,
      toolName,
      decision,
      ruleIds,
      latencyMs,
      reason,
      severity: ruleDecision?.severity,
      messageRedacted
    };
  }
}

function idKey(id: JsonRpcId): string {
  return `${typeof id}:${String(id)}`;
}

function extractToolName(message: JsonRpcMessage): string | undefined {
  const params = typeof message.params === "object" && message.params !== null && !Array.isArray(message.params)
    ? (message.params as Record<string, unknown>)
    : undefined;
  return typeof params?.name === "string" ? params.name : undefined;
}
