import { GoogleAnalytics } from "@next/third-parties/google";

import { frontendConfig } from "@/lib/frontend-config";

export function AppGoogleAnalytics() {
  const measurementId = frontendConfig.gaMeasurementId;
  if (!measurementId) {
    return null;
  }

  return <GoogleAnalytics gaId={measurementId} />;
}
