import type { DecisionFilter, SeatbeltDecision, SeatbeltEvent } from "./types";

export const decisionLabels: Record<SeatbeltDecision, string> = {
  allowed: "Allowed",
  blocked: "Blocked",
  redacted: "Redacted",
  error: "Error"
};

export function eventKey(event: SeatbeltEvent, index: number): string {
  const id = readMessageId(event.messageRedacted);
  return `${event.runId}:${event.timestamp}:${event.direction}:${event.method ?? "unknown"}:${id ?? index}`;
}

export function filterEvents(events: SeatbeltEvent[], filter: DecisionFilter): SeatbeltEvent[] {
  return filter === "all" ? events : events.filter((event) => event.decision === filter);
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function readMessageId(value: unknown): string | number | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}
