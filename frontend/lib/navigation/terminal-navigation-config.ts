import {
  BarChart3,
  Bell,
  Calculator,
  Flame,
  LayoutDashboard,
  LineChart,
  Mail,
  ScanSearch,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

export const marketNavigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tone: "blue" as const },
  { label: "Market Pulse", href: "/market-pulse", icon: Flame, tone: "fire" as const },
  { label: "Stocks", href: "/stocks", icon: LineChart, tone: "blue" as const },
  { label: "Scanner", href: "/scanner", icon: ScanSearch, tone: "blue" as const },
  { label: "Signals", href: "/signals", icon: Bell, tone: "blue" as const },
  { label: "Watchlist", href: "/watchlist", icon: BarChart3, tone: "blue" as const },
] as const;

export const adminNavigationItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Users", href: "/admin/users", icon: Users, exact: false },
  { label: "Configuration", href: "/admin/configuration", icon: Settings, exact: false },
  { label: "Tax Planner", href: "/admin/tax-planner", icon: Calculator, exact: false },
  { label: "Jobs", href: "/admin/jobs", icon: Workflow, exact: false },
  { label: "Email Campaigns", href: "/admin/email-campaigns", icon: Mail, exact: false },
] as const;

function normalizeNavPathname(pathname: string) {
  return pathname === "/" ? "/dashboard" : pathname;
}

export function isNavigationItemActive(pathname: string, href: string) {
  const normalizedPathname = normalizeNavPathname(pathname);

  if (href === "/stocks" || href === "/wealth" || href === "/market-pulse") {
    return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
  }

  return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
}
