import { create } from "zustand";

type CommandState = {
  isOpen: boolean;
  query: string;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
};

export const useCommandStore = create<CommandState>((set) => ({
  isOpen: false,
  query: "",
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: "" }),
  setQuery: (query) => set({ query }),
}));
