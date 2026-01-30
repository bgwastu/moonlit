"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { MantineThemeOverride } from "@mantine/core";
import { HistoryItem, Song } from "@/interfaces";

const HISTORY_STORAGE_KEY = "moonlit-history";
const MAX_HISTORY_ITEMS = 50;

interface AppContextValue {
  // Song state
  song: Song | null;
  setSong: (song: Song | null) => void;

  // History state (persisted to localStorage)
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  clearHistory: () => void;

  // Theme state
  theme: MantineThemeOverride;
  setTheme: (theme: MantineThemeOverride) => void;
}

const defaultTheme: MantineThemeOverride = {
  colorScheme: "dark",
  primaryColor: "violet",
  primaryShade: 5,
  white: "#f3f0ff",
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [song, setSong] = useState<Song | null>(null);
  const [history, setHistoryState] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<MantineThemeOverride>(defaultTheme);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        setHistoryState(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
    setIsHydrated(true);
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }, [history, isHydrated]);

  const setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>> = useCallback(
    (action) => {
      setHistoryState((prev) => {
        const newHistory = typeof action === "function" ? action(prev) : action;
        return newHistory.slice(0, MAX_HISTORY_ITEMS);
      });
    },
    [],
  );

  const clearHistory = useCallback(() => {
    setHistoryState([]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        song,
        setSong,
        history,
        setHistory,
        clearHistory,
        theme,
        setTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
