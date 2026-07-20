export function MoneySnapshotProjectionCue() {
  return (
    <div aria-hidden="true" className="wealth-snapshot-projection-cue">
      <svg preserveAspectRatio="none" viewBox="0 0 168 52">
        <defs>
          <linearGradient id="wealth-snapshot-projection" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0%" stopColor="#9f70ff" />
            <stop offset="100%" stopColor="#e9c8ff" />
          </linearGradient>
        </defs>
        <path className="wealth-snapshot-projection-fill" d="M0 43 C31 43 35 31 62 33 S96 22 114 25 S145 17 168 5 V52 H0Z" />
        <path className="wealth-snapshot-projection-line" d="M0 43 C31 43 35 31 62 33 S96 22 114 25 S145 17 168 5" />
        <circle cx="168" cy="5" r="3.5" />
      </svg>
    </div>
  );
}
