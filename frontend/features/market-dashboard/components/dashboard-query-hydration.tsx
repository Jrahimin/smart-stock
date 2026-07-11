"use client";

import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import type { ReactNode } from "react";

type DashboardQueryHydrationProps = {
  state: DehydratedState;
  children: ReactNode;
};

export function DashboardQueryHydration({ state, children }: DashboardQueryHydrationProps) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
