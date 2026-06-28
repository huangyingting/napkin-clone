"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME_MODE,
  nextAppThemeMode,
  normalizeAppThemeMode,
  resolveAppThemeMode,
  type AppThemeMode,
  type ResolvedAppThemeMode,
} from "@/lib/app-shell/theme";

type ThemeModeContextValue = {
  mode: AppThemeMode;
  resolvedMode: ResolvedAppThemeMode;
  setMode: (mode: AppThemeMode) => void;
  cycleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);
const THEME_MODE_CHANGE_EVENT = "textiq-theme-mode-change";

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyThemeMode(mode: AppThemeMode): ResolvedAppThemeMode {
  const resolvedMode = resolveAppThemeMode(mode, systemPrefersDark());
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = resolvedMode;
  return resolvedMode;
}

function storedThemeMode(): AppThemeMode {
  try {
    return normalizeAppThemeMode(
      window.localStorage.getItem(APP_THEME_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_APP_THEME_MODE;
  }
}

function resolvedStoredThemeMode(): ResolvedAppThemeMode {
  return resolveAppThemeMode(storedThemeMode(), systemPrefersDark());
}

function subscribeThemeMode(onStoreChange: () => void) {
  const notify = () => {
    applyThemeMode(storedThemeMode());
    onStoreChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === APP_THEME_STORAGE_KEY) notify();
  };
  const onSystemThemeChange = () => {
    if (storedThemeMode() === "system") notify();
  };
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");

  window.addEventListener(THEME_MODE_CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  media?.addEventListener("change", onSystemThemeChange);

  return () => {
    window.removeEventListener(THEME_MODE_CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onSystemThemeChange);
  };
}

function serverThemeModeSnapshot(): AppThemeMode {
  return DEFAULT_APP_THEME_MODE;
}

function serverResolvedThemeModeSnapshot(): ResolvedAppThemeMode {
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(
    subscribeThemeMode,
    storedThemeMode,
    serverThemeModeSnapshot,
  );
  const resolvedMode = useSyncExternalStore(
    subscribeThemeMode,
    resolvedStoredThemeMode,
    serverResolvedThemeModeSnapshot,
  );

  const setMode = useCallback((nextMode: AppThemeMode) => {
    try {
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, nextMode);
    } catch {
      // Ignore blocked storage; the in-memory and DOM theme still update.
    }
    applyThemeMode(nextMode);
    window.dispatchEvent(new Event(THEME_MODE_CHANGE_EVENT));
  }, []);

  const cycleMode = useCallback(() => {
    setMode(nextAppThemeMode(mode));
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, resolvedMode, setMode, cycleMode }),
    [mode, resolvedMode, setMode, cycleMode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider.");
  }
  return context;
}
