import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ProfileView } from "@/features/auth/components/profile-view";
import { ProtectedRoute } from "@/features/auth/components/protected-route";

export default function ProfilePage() {
  return (
    <TerminalAppShell>
      <ProtectedRoute>
        <ProfileView />
      </ProtectedRoute>
    </TerminalAppShell>
  );
}
