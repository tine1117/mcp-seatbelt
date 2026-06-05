import type { SeatbeltDecision } from "../types";
import { decisionLabels } from "../utils";

interface StatusPillProps {
  decision: SeatbeltDecision;
}

export function StatusPill({ decision }: StatusPillProps) {
  return <span className={`status-pill status-pill--${decision}`}>{decisionLabels[decision]}</span>;
}
