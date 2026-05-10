"use client";

import Link from "next/link";

import { coreCommandItems } from "@/lib/command/command-registry";
import { searchCommands } from "@/lib/command/command-search";
import { useCommandStore } from "@/stores/use-command-store";

export function GlobalCommandPalette() {
  const isOpen = useCommandStore((state) => state.isOpen);
  const query = useCommandStore((state) => state.query);
  const setQuery = useCommandStore((state) => state.setQuery);
  const close = useCommandStore((state) => state.close);

  if (!isOpen) {
    return null;
  }

  const results = searchCommands(coreCommandItems, query);

  return (
    <div className="command-overlay" role="dialog" aria-label="Command palette">
      <div className="command-panel">
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="Search stocks, screens, signals..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="command-results">
          {results.map((item) =>
            item.href ? (
              <Link href={item.href} key={item.id} onClick={close}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            ) : (
              <button key={item.id} type="button">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
