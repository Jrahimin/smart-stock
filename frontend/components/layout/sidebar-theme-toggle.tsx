"use client";

import { Moon, Sun } from "lucide-react";

import { useWorkspaceStore } from "@/stores/use-workspace-store";

type SidebarThemeToggleProps = {
  collapsed: boolean;
};

export function SidebarThemeToggle({ collapsed }: SidebarThemeToggleProps) {
  const theme = useWorkspaceStore((state) => state.theme);
  const setTheme = useWorkspaceStore((state) => state.setTheme);
  const isLight = theme === "light";

  const toggleTheme = () => setTheme(isLight ? "dark" : "light");

  if (collapsed) {
    return (
      <div className="sidebar-theme-toggle sidebar-theme-toggle-collapsed">
        <button
          aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
          className="sidebar-theme-icon-button"
          onClick={toggleTheme}
          title={isLight ? "Light mode" : "Dark mode"}
          type="button"
        >
          {isLight ? <Sun aria-hidden="true" size={16} strokeWidth={2.1} /> : <Moon aria-hidden="true" size={16} strokeWidth={2.1} />}
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-theme-toggle">
      <span className="sidebar-theme-toggle-label">Appearance</span>
      <button
        aria-checked={isLight}
        aria-label={isLight ? "Light mode on. Switch to dark mode" : "Dark mode on. Switch to light mode"}
        className="sidebar-theme-switch"
        onClick={toggleTheme}
        role="switch"
        type="button"
      >
        <span className="sidebar-theme-switch-track">
          <span aria-hidden="true" className={`sidebar-theme-switch-thumb ${isLight ? "sidebar-theme-switch-thumb-light" : ""}`} />
          <span
            className={`sidebar-theme-switch-segment sidebar-theme-switch-segment-dark ${!isLight ? "sidebar-theme-switch-segment-active" : ""}`}
          >
            <Moon size={14} strokeWidth={2.2} />
            <span>Dark</span>
          </span>
          <span
            className={`sidebar-theme-switch-segment sidebar-theme-switch-segment-light ${isLight ? "sidebar-theme-switch-segment-active" : ""}`}
          >
            <Sun size={14} strokeWidth={2.2} />
            <span>Light</span>
          </span>
        </span>
      </button>
    </div>
  );
}
