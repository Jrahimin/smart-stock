import type { DataQualityFlag } from "@/lib/api/backend-api-types";

type DataQualityBadgeProps = {
  quality: DataQualityFlag | "UNKNOWN";
};

export function DataQualityBadge({ quality }: DataQualityBadgeProps) {
  return <span className={`quality-badge quality-badge-${quality.toLowerCase()}`}>{quality}</span>;
}
