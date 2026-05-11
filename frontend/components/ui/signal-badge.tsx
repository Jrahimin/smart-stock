import type { SignalType } from "@/lib/api/backend-api-types";

type SignalBadgeProps = {
  signal: SignalType;
};

export function SignalBadge({ signal }: SignalBadgeProps) {
  return (
    <span className={`signal-badge signal-badge-${signal.toLowerCase()}`}>
      <i aria-hidden="true" />
      {signal}
    </span>
  );
}
