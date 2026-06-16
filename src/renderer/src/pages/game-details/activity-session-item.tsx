import type { GameSession } from "../../declaration";
import { ActivityHardwareCard } from "./activity-hardware-card";
import "./activity-session-item.scss";

export interface ActivitySessionItemProps {
  session: GameSession;
}

function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function ActivitySessionItem({
  session,
}: Readonly<ActivitySessionItemProps>) {
  return (
    <div className="activity-session-item">
      <div className="activity-session-item__row">
        <div className="activity-session-item__info">
          <span className="activity-session-item__date">
            {formatDate(session.startTime)}
          </span>
          <span className="activity-session-item__time">
            {formatTime(session.startTime)} — {formatTime(session.endTime)}
          </span>
        </div>
        <span className="activity-session-item__duration">
          {formatDuration(session.durationMs)}
        </span>
      </div>

      {session.hardwareMetrics && (
        <div className="activity-session-item__hardware">
          <ActivityHardwareCard metrics={session.hardwareMetrics} />
        </div>
      )}
    </div>
  );
}
