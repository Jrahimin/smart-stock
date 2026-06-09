import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { MoneyCalendarView } from "@/features/wealth/money-calendar-view";

export default function WealthCalendarPage() {
  return (
    <TerminalAppShell>
      <MoneyCalendarView />
    </TerminalAppShell>
  );
}
