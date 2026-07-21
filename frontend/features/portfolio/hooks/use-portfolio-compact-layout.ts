"use client";

import { useEffect, useState } from "react";

const COMPACT_LAYOUT_QUERY = "(max-width: 960px)";

function readCompactLayout() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}

export function usePortfolioCompactLayout() {
  const [compact, setCompact] = useState(readCompactLayout);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}
