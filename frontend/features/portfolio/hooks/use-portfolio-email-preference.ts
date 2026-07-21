"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "portfolio-email-summary-enabled";

export function usePortfolioEmailPreference() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setEnabled(false);
    } finally {
      setReady(true);
    }
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Preference stays in memory for this session.
    }
  }, []);

  return { enabled, ready, toggle };
}
