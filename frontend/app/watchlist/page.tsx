import { TerminalAppShell } from "@/components/layout/terminal-app-shell";
import { ProtectedRoute } from "@/features/auth/components/protected-route";
import { WatchlistView } from "@/features/watchlist/watchlist-view";

export default function WatchlistPage() {
  return (
    <TerminalAppShell>
      <ProtectedRoute>
        <WatchlistView />
      </ProtectedRoute>
    </TerminalAppShell>
  );
}
