import type { Metadata } from "next";

import { AdminUserDetailsPageShell } from "@/features/admin/admin-user-details-page-shell";

export const metadata: Metadata = {
  title: "User Details — StockWealth BD",
  description: "Administrative user account, portfolio, and session details.",
  robots: { index: false, follow: false },
};

export default async function AdminUserDetailsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <AdminUserDetailsPageShell userId={userId} />;
}
