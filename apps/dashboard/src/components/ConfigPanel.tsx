import { useState } from "react";
import type { DashboardConfig, SeatbeltSchemaStatus } from "../types";

interface ConfigPanelProps {
  config?: DashboardConfig;
}

export const SCHEMA_FIX_SNIPPET = '  "$schema": "../docs/seatbelt.config.schema.json",';

export function shouldShowSchemaFix(status: SeatbeltSchemaStatus | undefined): boolean {
  return status === "missing" || status === "mismatched";
}

export function ConfigPanel({ config }: ConfigPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const allowlistPaths = config?.effective.allowlist.paths ?? [];
  const sourceText = config
    ? `mode:${config.sources.mode} root:${config.sources.root} allowlist:${config.sources.allowlist}`
    : "Loading";
  const schemaText = config ? config.schema.status : "Loading";
  const showSchemaFix = shouldShowSchemaFix(config?.schema.status);
  const copyFeedback = copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "";

  async function handleCopySchemaFix() {
    try {
      await navigator.clipboard.writeText(SCHEMA_FIX_SNIPPET);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="config-panel" aria-label="Effective seatbelt config">
      <span className="summary-title">Effective config</span>
      <dl className="config-list">
        <div>
          <dt>Path</dt>
          <dd>{config ? <code>{config.path}</code> : <span>Loading</span>}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>
            <span className={`mode-badge mode-badge--${config?.effective.mode ?? "loading"}`}>
              {config?.effective.mode ?? "Loading"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Root</dt>
          <dd>{config?.effective.root ?? "Loading"}</dd>
        </div>
        <div>
          <dt>Allowlist</dt>
          <dd>
            {!config ? (
              <span>Loading</span>
            ) : allowlistPaths.length > 0 ? (
              allowlistPaths.map((path) => <code key={path}>{path}</code>)
            ) : (
              <span>None</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceText}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>
            <span className={`schema-badge schema-badge--${config?.schema.status ?? "loading"}`}>{schemaText}</span>
            {config?.schema.declared ? <code>{config.schema.declared}</code> : null}
          </dd>
        </div>
      </dl>
      {showSchemaFix ? (
        <div className="schema-fix">
          <button
            className={`copy-button copy-button--${copyState}`}
            type="button"
            onClick={handleCopySchemaFix}
          >
            Copy schema fix
          </button>
          <span className="copy-feedback" role="status" aria-live="polite">
            {copyFeedback}
          </span>
        </div>
      ) : null}
      {config?.error ? <p className="config-error">{config.error}</p> : null}
    </section>
  );
}
