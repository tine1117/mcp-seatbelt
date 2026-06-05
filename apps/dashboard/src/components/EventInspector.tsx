import { Check, Copy, XCircle } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { SeatbeltEvent } from "../types";
import { StatusPill } from "./StatusPill";

interface EventInspectorProps {
  event?: SeatbeltEvent;
}

type CopyState = "idle" | "copied" | "failed";

const CONFIG_SNIPPET = `{
  "command": "mcp-seatbelt",
  "args": ["wrap", "--", "npx", "@modelcontextprotocol/server-filesystem", "~/projects"]
}`;

export function EventInspector({ event }: EventInspectorProps) {
  if (!event) {
    return (
      <aside className="inspector" aria-labelledby="event-inspector-title">
        <h2 id="event-inspector-title">Event detail</h2>
        <p className="empty-copy">Select an event to inspect the redacted JSON-RPC payload.</p>
        <ConfigSnippet />
      </aside>
    );
  }

  const json = JSON.stringify(event.messageRedacted, null, 2);

  return (
    <aside className="inspector" aria-labelledby="event-inspector-title">
      <div className="inspector-heading">
        <div>
          <h2 id="event-inspector-title">Event detail</h2>
          <StatusPill decision={event.decision} />
        </div>
        <CopyButton label="Copy redacted JSON" shortLabel="Copy JSON" text={json} />
      </div>

      <dl className="detail-list">
        <div>
          <dt>Method</dt>
          <dd>{event.method ?? "-"}</dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>{event.toolName ?? "-"}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{event.reason ?? "No rule reason"}</dd>
        </div>
      </dl>

      <p id="event-json-help" className="sr-only">
        Redacted JSON-RPC payload. Focus this region to scroll long payloads with the keyboard.
      </p>
      <pre className="json-view" tabIndex={0} aria-label="Redacted JSON-RPC payload" aria-describedby="event-json-help">
        {json}
      </pre>
      <ConfigSnippet />
    </aside>
  );
}

function ConfigSnippet() {
  return (
    <section className="snippet" aria-labelledby="config-snippet-title">
      <div className="snippet-heading">
        <h3 id="config-snippet-title">Wrap a server</h3>
        <CopyButton label="Copy config snippet" shortLabel="Copy config" text={CONFIG_SNIPPET} />
      </div>
      <pre tabIndex={0} aria-label="Client config snippet">
        {CONFIG_SNIPPET}
      </pre>
    </section>
  );
}

function CopyButton({ label, shortLabel, text }: { label: string; shortLabel: string; text: string }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== undefined) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (): Promise<void> => {
    const copied = await copyText(text);
    setCopyState(copied ? "copied" : "failed");

    if (resetTimerRef.current !== undefined) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2200);
  };

  const handleCopyKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void handleCopy();
    }
  };

  const Icon = copyState === "copied" ? Check : copyState === "failed" ? XCircle : Copy;
  const visibleLabel = copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : shortLabel;
  const statusMessage =
    copyState === "copied" ? `${label} copied.` : copyState === "failed" ? `${label} could not be copied.` : "";

  return (
    <div className="copy-control">
      <button
        className={`copy-button copy-button--${copyState}`}
        type="button"
        aria-label={label}
        onClick={() => void handleCopy()}
        onKeyDown={handleCopyKeyDown}
      >
        <Icon aria-hidden="true" size={16} />
        <span>{visibleLabel}</span>
      </button>
      <span className="copy-feedback" role="status" aria-live="polite">
        {statusMessage}
      </span>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    activeElement?.focus();
    return copied;
  } catch {
    return false;
  }
}
