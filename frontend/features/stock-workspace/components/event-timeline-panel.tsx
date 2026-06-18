"use client";

import { useState } from "react";

import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type EventTimelinePanelProps = {
  decision: StockDecisionViewModel;
};

function truncateEventTitle(title: string, maxLength = 20): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

export function EventTimelinePanel({ decision }: EventTimelinePanelProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);
  if (!decision.available || decision.events.length === 0) {
    return null;
  }

  const selectedEvent = selectedEventIndex !== null ? decision.events[selectedEventIndex] : null;

  return (
    <>
      <div className="trader-workspace-strip event-strip">
        <div className="event-timeline-horizontal">
          {decision.events.map((event, index) => (
            <button
              className="event-timeline-node"
              key={`${event.event_date}-${event.event_type}-${event.title}-${index}`}
              onClick={() => setSelectedEventIndex(index)}
              title={event.title}
              type="button"
            >
              <span className="event-timeline-dot" />
              <strong>{truncateEventTitle(event.title)}</strong>
              <small>{event.event_date}</small>
              {index < decision.events.length - 1 ? <span aria-hidden="true" className="event-timeline-line" /> : null}
            </button>
          ))}
        </div>
      </div>
      <WorkspaceModal isOpen={selectedEvent !== null} onClose={() => setSelectedEventIndex(null)} title="Event Details">
        {selectedEvent ? (
          <div className="event-detail-modal">
            <p>
              <strong>Category:</strong> {selectedEvent.category}
            </p>
            <p>
              <strong>Date:</strong> {selectedEvent.event_date}
            </p>
            <p>
              <strong>Title:</strong> {selectedEvent.title}
            </p>
            <p>{selectedEvent.summary ?? "No additional details available."}</p>
          </div>
        ) : null}
      </WorkspaceModal>
    </>
  );
}

type DataFreshnessIndicatorProps = {
  decision: StockDecisionViewModel;
};

export function DataFreshnessIndicator({ decision }: DataFreshnessIndicatorProps) {
  if (!decision.available) {
    return null;
  }

  return (
    <div className={`data-freshness-compact ${decision.freshness.isStale ? "data-freshness-stale" : ""}`} title={decision.freshness.helper}>
      {decision.freshness.label}
    </div>
  );
}
