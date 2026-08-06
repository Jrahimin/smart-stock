const DHAKA_TIMEZONE = "Asia/Dhaka";

const dhakaDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dhakaDateTimeWithZoneFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

export function formatAdminDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return dhakaDateTimeFormatter.format(new Date(value));
}

export function formatAdminDateTimeWithZone(value: string | null | undefined) {
  if (!value) return "—";
  return dhakaDateTimeWithZoneFormatter.format(new Date(value));
}

export function formatAdminDuration(durationMs: number | null | undefined) {
  if (durationMs == null) return "—";
  if (durationMs < 1_000) return `${durationMs} ms`;
  const seconds = durationMs / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
