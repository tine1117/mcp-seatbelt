import type { JsonRpcMessage } from "../types/json-rpc.js";
import type { SeatbeltMode, SeatbeltOptions } from "../types/options.js";
import { detectDestructiveShell, detectMetadataEndpoint, detectPathTraversal, detectSensitivePath } from "./detectors.js";
import { createNormalizedCandidate, type NormalizedCandidate } from "./normalization.js";
import type { RuleState } from "./state.js";
import { hashToolList } from "./tool-list.js";

export interface RuleDecision {
  action: "allow" | "block";
  ruleIds: string[];
  reasons: string[];
  severity?: "low" | "medium" | "high";
}

interface RuleHit {
  ruleId: string;
  reason: string;
  severity: "medium" | "high";
}

export interface RuleEngine {
  evaluateClientMessage(message: JsonRpcMessage, state: RuleState): RuleDecision;
  evaluateServerMessage(message: JsonRpcMessage, state: RuleState, requestMethod?: string): RuleDecision;
}

export function createRuleEngine(options: SeatbeltOptions): RuleEngine {
  return {
    evaluateClientMessage(message, state) {
      void state;
      if (message.method !== "tools/call") {
        return allow();
      }

      const params = getRecord(message.params);
      const args = params ? params.arguments : undefined;
      const strings = collectStrings(args);
      const hits: RuleHit[] = [];

      for (const value of strings) {
        const candidates = expandCandidates(value);
        for (const candidate of candidates) {
          const sensitivePathReason = detectSensitivePath(candidate);
          if (sensitivePathReason) {
            hits.push({ ruleId: "sensitive-path", reason: sensitivePathReason, severity: "high" });
          }

          const shellReason = detectDestructiveShell(candidate);
          if (shellReason) {
            hits.push({ ruleId: "destructive-shell", reason: shellReason, severity: "high" });
          }

          const traversalReason = detectPathTraversal(candidate, options.root, options.allowlistPaths);
          if (traversalReason) {
            hits.push({ ruleId: "path-traversal", reason: traversalReason, severity: "medium" });
          }

          if (detectMetadataEndpoint(candidate)) {
            hits.push({
              ruleId: "metadata-endpoint",
              reason: "metadata service endpoint access was requested",
              severity: "high"
            });
          }
        }
      }

      return decisionFromHits(hits, options.mode);
    },
    evaluateServerMessage(message, state, requestMethod) {
      if (requestMethod !== "tools/list") {
        return allow();
      }

      const result = getRecord(message.result);
      const tools = Array.isArray(result?.tools) ? result.tools : undefined;
      if (!tools) {
        return allow();
      }

      const hash = hashToolList(tools);
      if (!state.toolListHash) {
        state.toolListHash = hash;
        return allow();
      }

      if (state.toolListHash !== hash) {
        return decisionFromHits(
          [
            {
              ruleId: "tool-rug-pull",
              reason: "tools/list changed after the initial approved schema",
              severity: "high"
            }
          ],
          options.mode
        );
      }

      return allow();
    }
  };
}

function allow(ruleIds: string[] = [], reasons: string[] = [], severity?: RuleDecision["severity"]): RuleDecision {
  return { action: "allow", ruleIds, reasons, severity };
}

function decisionFromHits(hits: RuleHit[], mode: SeatbeltMode): RuleDecision {
  const uniqueHits = dedupeHits(hits);
  if (uniqueHits.length === 0) {
    return allow();
  }

  const severity = uniqueHits.some((hit) => hit.severity === "high") ? "high" : "medium";
  const shouldBlock = mode === "protect" ? severity === "high" : mode === "strict";
  return {
    action: shouldBlock ? "block" : "allow",
    ruleIds: uniqueHits.map((hit) => hit.ruleId),
    reasons: uniqueHits.map((hit) => hit.reason),
    severity
  };
}

function dedupeHits(hits: RuleHit[]): RuleHit[] {
  const seen = new Set<string>();
  const result: RuleHit[] = [];
  for (const hit of hits) {
    const key = `${hit.ruleId}:${hit.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(hit);
    }
  }
  return result;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  const record = getRecord(value);
  if (record) {
    return Object.values(record).flatMap((item) => collectStrings(item));
  }
  return [];
}

function expandCandidates(value: string): NormalizedCandidate[] {
  const candidate = createNormalizedCandidate(value);
  if (!candidate.command.hasUnquotedShellSeparator) {
    return [candidate];
  }

  return [
    candidate,
    ...candidate.command.tokens.map((token) => createNormalizedCandidate(token))
  ];
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
