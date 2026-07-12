"use client";

import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import type { ReactNode } from "react";

type PulseQueryHydrationProps = {
  state: DehydratedState;
  children: ReactNode;
};

export function PulseQueryHydration({ state, children }: PulseQueryHydrationProps) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
