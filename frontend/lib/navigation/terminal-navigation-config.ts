import {
  Bell,
  Calculator,
  Flame,
  LayoutDashboard,
  LineChart,
  Mail,
  PieChart,
  ScanSearch,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

export function navigationLabel(label: string, locale = "en") {
  const bn: Record<string,string> = { Dashboard:"ড্যাশবোর্ড", "Market Pulse":"মার্কেট পালস", Stocks:"শেয়ার", Scanner:"স্ক্যানার", Signals:"সিগন্যাল", "My Portfolio":"আমার পোর্টফোলিও", Operations:"পরিচালনা", Users:"ব্যবহারকারী", Configuration:"সেটিংস", "Tax Planner":"কর পরিকল্পনা", Jobs:"কাজ", "Email Campaigns":"ইমেইল প্রচার" };
  return locale === "bn" ? bn[label] ?? label : label;
}

export const marketNavigationItems = [
  { label: "Dashboard", href: "/", guideId: "nav-dashboard", icon: LayoutDashboard, tone: "blue" as const },
  { label: "Market Pulse", href: "/market-pulse", guideId: "nav-market-pulse", icon: Flame, tone: "fire" as const },
  { label: "Stocks", href: "/stocks", guideId: "nav-stocks", icon: LineChart, tone: "blue" as const },
  { label: "Scanner", href: "/scanner", guideId: "nav-scanner", icon: ScanSearch, tone: "blue" as const },
  { label: "Signals", href: "/signals", guideId: "nav-signals", icon: Bell, tone: "blue" as const },
  { label: "My Portfolio", href: "/portfolio", guideId: "nav-portfolio", icon: PieChart, tone: "blue" as const },
] as const;

export const adminNavigationItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Users", href: "/admin/users", icon: Users, exact: false },
  { label: "Configuration", href: "/admin/configuration", icon: Settings, exact: false },
  { label: "Tax Planner", href: "/admin/tax-planner", icon: Calculator, exact: false },
  { label: "Jobs", href: "/admin/jobs", icon: Workflow, exact: false },
  { label: "Email Campaigns", href: "/admin/email-campaigns", icon: Mail, exact: false },
] as const;

export function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
