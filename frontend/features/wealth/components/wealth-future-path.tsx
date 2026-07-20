type WealthFuturePathProps = {
  labels: {
    today: string;
    oneYear: string;
    fiveYears: string;
    tenYears: string;
  };
};

export function WealthFuturePath({ labels }: WealthFuturePathProps) {
  return (
    <div aria-hidden="true" className="wealth-future-path">
      <svg viewBox="0 0 680 240" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="wealth-path-gradient" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0%" stopColor="#b77cff" />
            <stop offset="72%" stopColor="#d3a8ff" />
            <stop offset="100%" stopColor="#ffe3a5" />
          </linearGradient>
          <filter id="wealth-path-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path className="wealth-future-hills" d="M0 188 C92 112 148 218 242 160 S402 210 492 139 S602 170 680 122 V240 H0Z" />
        <path className="wealth-future-line" d="M74 188 C148 188 164 126 242 132 S338 72 404 88 S540 82 594 26" filter="url(#wealth-path-glow)" />
        <circle className="wealth-future-dot" cx="74" cy="188" r="6" />
        <circle className="wealth-future-dot" cx="242" cy="132" r="7" />
        <circle className="wealth-future-dot" cx="404" cy="88" r="7" />
        <path className="wealth-future-star" d="M594 8l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" />
      </svg>
      <span className="wealth-future-label wealth-future-label-today">{labels.today}</span>
      <span className="wealth-future-label wealth-future-label-one-year">{labels.oneYear}</span>
      <span className="wealth-future-label wealth-future-label-five-years">{labels.fiveYears}</span>
      <span className="wealth-future-label wealth-future-label-ten-years">{labels.tenYears}</span>
    </div>
  );
}
