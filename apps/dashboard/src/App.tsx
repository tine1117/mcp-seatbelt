import { useEffect, useState } from "react";
import { fetchConfig, fetchEvents, fetchRuns, fetchSummary } from "./api";
import { EventInspector } from "./components/EventInspector";
import { EventTimeline } from "./components/EventTimeline";
import { RunSidebar } from "./components/RunSidebar";
import type { DashboardConfig, DecisionFilter, RunPointer, RunSummary, SeatbeltEvent } from "./types";
import { filterEvents } from "./utils";
import "./styles.css";

const STREAM_RECONNECT_DELAY_MS = 1000;

export function App() {
  const [runs, setRuns] = useState<RunPointer[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [summary, setSummary] = useState<RunSummary>();
  const [config, setConfig] = useState<DashboardConfig>();
  const [events, setEvents] = useState<SeatbeltEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SeatbeltEvent>();
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [loadError, setLoadError] = useState<string>();
  const [runsLoading, setRunsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  const handleFilterChange = (nextFilter: DecisionFilter): void => {
    setFilter(nextFilter);
    setSelectedEvent((current) => {
      const visibleEvents = filterEvents(events, nextFilter);
      return current && visibleEvents.includes(current) ? current : visibleEvents[0];
    });
  };

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((nextConfig) => {
        if (active) {
          setConfig(nextConfig);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setLoadError(error.message);
        }
      });
    fetchRuns()
      .then((nextRuns) => {
        if (!active) {
          return;
        }
        setRuns(nextRuns);
        setSelectedRunId((current) => current ?? nextRuns[0]?.runId);
        if (nextRuns.length === 0) {
          setEventsLoading(false);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setLoadError(error.message);
          setEventsLoading(false);
        }
      })
      .finally(() => {
        if (active) {
          setRunsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      return undefined;
    }

    let active = true;
    setEventsLoading(true);
    setEvents([]);
    setSelectedEvent(undefined);
    setSummary(undefined);

    fetchEvents(selectedRunId)
      .then((nextEvents) => {
        if (!active) {
          return;
        }
        setEvents(nextEvents);
        setSelectedEvent(nextEvents[0]);
      })
      .catch((error: Error) => {
        if (active) {
          setLoadError(error.message);
        }
      })
      .finally(() => {
        if (active) {
          setEventsLoading(false);
        }
      });
    fetchSummary(selectedRunId)
      .then((nextSummary) => {
        if (active) {
          setSummary(nextSummary);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setLoadError(error.message);
        }
      });

    const streamUrl = `/api/events/stream?runId=${encodeURIComponent(selectedRunId)}`;
    const streamErrorMessage = `Live event stream disconnected for ${selectedRunId}. Reconnecting...`;
    let stream: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearStreamError = (): void => {
      setLoadError((current) => (current === streamErrorMessage ? undefined : current));
    };

    const connectStream = (): void => {
      if (!active) {
        return;
      }

      reconnectTimer = undefined;
      const nextStream = new EventSource(streamUrl);
      stream = nextStream;

      nextStream.onopen = () => {
        if (active && stream === nextStream) {
          clearStreamError();
        }
      };
      nextStream.onmessage = (message) => {
        if (!active || stream !== nextStream) {
          return;
        }
        const event = JSON.parse(message.data) as SeatbeltEvent;
        clearStreamError();
        setEvents((current) => [...current, event]);
        setSelectedEvent((current) => current ?? event);
      };
      nextStream.onerror = () => {
        nextStream.close();
        if (!active || stream !== nextStream) {
          return;
        }
        setLoadError(streamErrorMessage);
        if (reconnectTimer === undefined) {
          reconnectTimer = setTimeout(connectStream, STREAM_RECONNECT_DELAY_MS);
        }
      };
    };
    connectStream();

    return () => {
      active = false;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      stream?.close();
    };
  }, [selectedRunId]);

  return (
    <div className="dashboard-backdrop">
      <div className="dashboard-window">
        <div className="app-shell">
          <RunSidebar
            runs={runs}
            selectedRunId={selectedRunId}
            summary={summary}
            config={config}
            isLoading={runsLoading}
            onSelectRun={setSelectedRunId}
          />
          <div className="workbench">
            {loadError ? <p className="load-error">Dashboard connection issue: {loadError}</p> : null}
            <EventTimeline
              events={events}
              selectedEvent={selectedEvent}
              filter={filter}
              isLoading={eventsLoading}
              onFilterChange={handleFilterChange}
              onSelectEvent={setSelectedEvent}
            />
            <EventInspector event={selectedEvent} />
          </div>
        </div>
      </div>
    </div>
  );
}
