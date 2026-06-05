import { ShieldCheck } from "lucide-react";
import type { DashboardConfig, RunPointer, RunSummary } from "../types";
import { formatTime } from "../utils";
import { ConfigPanel } from "./ConfigPanel";

interface RunSidebarProps {
  runs: RunPointer[];
  selectedRunId?: string;
  summary?: RunSummary;
  config?: DashboardConfig;
  isLoading?: boolean;
  onSelectRun: (runId: string) => void;
}

export function RunSidebar({ runs, selectedRunId, summary, config, isLoading = false, onSelectRun }: RunSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Runs">
      <div className="brand">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>mcp-seatbelt</strong>
          <span>Local MCP safety layer</span>
        </div>
      </div>

      <section className="summary-block" aria-label="Current run summary">
        <span className="summary-title">Current run</span>
        <strong>{selectedRunId ?? "No run selected"}</strong>
        {summary ? (
          <div className="summary-grid">
            <span>{summary.eventCount} events</span>
            <span>{summary.blockedCount} blocked</span>
            <span>{summary.redactedCount} redacted</span>
            <span>{summary.errorCount} errors</span>
          </div>
        ) : null}
      </section>

      <ConfigPanel config={config} />

      <nav className="run-list" aria-label="Run history">
        {isLoading ? (
          <p className="empty-copy" role="status">Loading runs...</p>
        ) : runs.length === 0 ? (
          <p className="empty-copy">No runs yet. Start a wrapped MCP server or run the demo.</p>
        ) : (
          runs.map((run) => (
            <button
              className={run.runId === selectedRunId ? "run-row run-row--selected" : "run-row"}
              key={run.runId}
              type="button"
              onClick={() => onSelectRun(run.runId)}
            >
              <span>{run.runId}</span>
              <small>{formatTime(run.startedAt)}</small>
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
