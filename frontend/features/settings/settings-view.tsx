"use client";

import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function SettingsView() {
  const theme = useWorkspaceStore((state) => state.theme);
  const setTheme = useWorkspaceStore((state) => state.setTheme);

  return (
    <section className="settings-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Workspace preferences</h1>
          <span>Control the institutional workspace experience.</span>
        </div>
      </div>

      <section className="workspace-card settings-panel">
        <div className="section-heading">
          <p className="eyebrow">Appearance</p>
          <h2>Theme</h2>
          <span>Dark mode is optimized for terminal-style trading. Light mode is a calm financial workspace.</span>
        </div>
        <div className="segmented-control">
          <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} type="button">
            Dark terminal
          </button>
          <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} type="button">
            Light workspace
          </button>
        </div>
      </section>
    </section>
  );
}
