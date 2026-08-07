export type ParsedAdminUserAgent = {
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  raw: string;
};

function versionAfter(userAgent: string, token: string) {
  const match = userAgent.match(new RegExp(`${token}([\\d.]+)`, "i"));
  return match?.[1] ?? null;
}

/** Turn a raw user-agent into the short, useful labels shown to administrators. */
export function parseAdminUserAgent(userAgent: string | null | undefined): ParsedAdminUserAgent | null {
  if (!userAgent?.trim()) return null;

  const lowered = userAgent.toLowerCase();
  const isTablet = /ipad|tablet|android(?!.*mobile)/i.test(userAgent);
  const isMobile = !isTablet && /mobile|iphone|ipod|android/i.test(userAgent);
  const deviceType = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

  let browser: string | null = null;
  let browserVersion: string | null = null;
  if (/edg\//i.test(userAgent) || /edge\//i.test(userAgent)) {
    browser = "Edge";
    browserVersion = versionAfter(userAgent, "(?:Edg|Edge)/");
  } else if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) {
    browser = "Opera";
    browserVersion = versionAfter(userAgent, "(?:OPR|Opera)/");
  } else if (/firefox\//i.test(userAgent)) {
    browser = "Firefox";
    browserVersion = versionAfter(userAgent, "Firefox/");
  } else if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) {
    browser = "Chrome";
    browserVersion = versionAfter(userAgent, "Chrome/");
  } else if (/safari\//i.test(userAgent) && !/chrome/i.test(userAgent)) {
    browser = "Safari";
    browserVersion = versionAfter(userAgent, "Version/");
  }

  const browserLabel = browser ? `${browser}${browserVersion ? ` ${browserVersion}` : ""}` : null;
  let operatingSystem: string | null = null;
  if (/windows/i.test(userAgent)) operatingSystem = "Windows";
  else if (/mac os|macintosh/i.test(userAgent)) operatingSystem = "macOS";
  else if (/android/i.test(userAgent)) {
    const version = versionAfter(userAgent, "Android ");
    operatingSystem = `Android${version ? ` ${version}` : ""}`;
  } else if (/iphone|ipad|ios/i.test(userAgent)) operatingSystem = "iOS";
  else if (/linux/i.test(lowered)) operatingSystem = "Linux";

  return { deviceType, browser: browserLabel, operatingSystem, raw: userAgent };
}
