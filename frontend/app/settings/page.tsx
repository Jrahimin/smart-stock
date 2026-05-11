import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { SettingsView } from "@/features/settings/settings-view";

export default function SettingsPage() {
  return (
    <TerminalAppShell>
      <SettingsView />
    </TerminalAppShell>
  );
}
