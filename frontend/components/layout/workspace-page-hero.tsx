"use client";

import { WorkspaceCommandSearch } from "@/components/command/workspace-command-search";
import type { ReactNode } from "react";

type WorkspacePageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  filterContextName?: string;
  onFilterTable?: (query: string) => void;
  children?: ReactNode;
  className?: string;
};

export function WorkspacePageHero({
  eyebrow,
  title,
  subtitle,
  filterContextName,
  onFilterTable,
  children,
  className,
}: WorkspacePageHeroProps) {
  return (
    <div className={className ? `explorer-hero ${className}` : "explorer-hero"}>
      <div className="explorer-hero-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <div className="explorer-hero-subtitle">{subtitle}</div>
      </div>

      <WorkspaceCommandSearch filterContextName={filterContextName} onFilterTable={onFilterTable} />

      {children}
    </div>
  );
}
