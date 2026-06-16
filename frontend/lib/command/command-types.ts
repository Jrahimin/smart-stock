export type CommandCategory = "NAVIGATION" | "STOCK" | "WATCHLIST" | "SCANNER" | "SIGNAL" | "ADMIN";

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  href?: string;
  keywords?: string[];
};
