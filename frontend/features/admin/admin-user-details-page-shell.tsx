import { cookies } from "next/headers";

import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { AdminUserDetailsView } from "@/features/admin/admin-user-details-view";
import { AdminRoute } from "@/features/auth/components/admin-route";
import { LOCALE_COOKIE_NAME, parseAppLocale } from "@/lib/locale/app-locale";

export async function AdminUserDetailsPageShell({ userId }: { userId: string }) {
  const cookieStore = await cookies();
  const locale = parseAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <TerminalAppShell dashboardLocale={locale}>
      <AdminRoute>
        <AdminUserDetailsView locale={locale} userId={userId} />
      </AdminRoute>
    </TerminalAppShell>
  );
}
