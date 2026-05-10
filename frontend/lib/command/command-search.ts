import type { CommandItem } from "@/lib/command/command-types";

export function searchCommands(items: CommandItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [item.label, item.description, item.category, ...(item.keywords ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
