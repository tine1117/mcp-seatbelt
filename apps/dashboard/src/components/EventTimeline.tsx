import type { DecisionFilter, SeatbeltEvent } from "../types";
import { decisionLabels, eventKey, filterEvents, formatTime } from "../utils";
import { StatusPill } from "./StatusPill";

interface EventTimelineProps {
  events: SeatbeltEvent[];
  selectedEvent?: SeatbeltEvent;
  filter: DecisionFilter;
  isLoading?: boolean;
  onFilterChange: (filter: DecisionFilter) => void;
  onSelectEvent: (event: SeatbeltEvent) => void;
}

const filters: DecisionFilter[] = ["all", "allowed", "blocked", "redacted", "error"];

export function EventTimeline({
  events,
  selectedEvent,
  filter,
  isLoading = false,
  onFilterChange,
  onSelectEvent
}: EventTimelineProps) {
  const visibleEvents = filterEvents(events, filter);

  return (
    <main className="timeline" aria-label="MCP event timeline">
      <div className="timeline-header">
        <div>
          <h1>Live MCP events</h1>
          <p>Runtime tool calls, redactions, blocks, and protocol errors.</p>
        </div>
        <div className="filter-tabs" aria-label="Decision filter">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item}
              className={filter === item ? "filter-tab filter-tab--selected" : "filter-tab"}
              key={item}
              type="button"
              onClick={() => onFilterChange(item)}
            >
              {item === "all" ? "All" : decisionLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="event-table-scroll">
        <div className="event-table" role="list" aria-label="Events">
          <div className="event-row event-row--head" aria-hidden="true">
            <span>Status</span>
            <span>Time</span>
            <span>Direction</span>
            <span>Method</span>
            <span>Rules</span>
          </div>
          {isLoading ? (
            <p className="empty-copy" role="status">Loading events...</p>
          ) : visibleEvents.length === 0 ? (
            <p className="empty-copy">No events match this filter.</p>
          ) : (
            visibleEvents.map((event, index) => (
              <button
                className={event === selectedEvent ? "event-row event-row--selected" : "event-row"}
                key={eventKey(event, index)}
                type="button"
                onClick={() => onSelectEvent(event)}
              >
                <span><StatusPill decision={event.decision} /></span>
                <span>{formatTime(event.timestamp)}</span>
                <span>{event.direction}</span>
                <span>{event.method ?? "-"}</span>
                <span>{event.ruleIds.length > 0 ? event.ruleIds.join(", ") : "-"}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
