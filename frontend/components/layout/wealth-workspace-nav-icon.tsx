"use client";

import { Banknote, Wallet } from "lucide-react";

type WealthWorkspaceNavIconProps = {
  className?: string;
};

export function WealthWorkspaceNavIcon({ className }: WealthWorkspaceNavIconProps) {
  return (
    <span className={`wealth-workspace-nav-icon-mark ${className ?? ""}`}>
      <Banknote aria-hidden="true" className="wealth-workspace-nav-icon-banknote" size={12} strokeWidth={2.15} />
      <Wallet aria-hidden="true" className="wealth-workspace-nav-icon-wallet" size={19} strokeWidth={2.1} />
    </span>
  );
}
