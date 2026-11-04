import Image from "next/image";

export function StockWealthLockup({ className = "", decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span className={`sw-lockup ${className}`}>
      <Image alt={decorative ? "" : "StockWealth BD"} height={118} src="/dashboard/stockwealth-lockup.webp" width={624} />
    </span>
  );
}
