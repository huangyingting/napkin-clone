"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { DockedPreference } from "@/lib/lexical/editing-surface";
import {
  DOCKED_PREFERENCE_STORAGE_KEY,
  parseStoredDockedPreference,
  toggleDockedPreference,
} from "@/lib/lexical/docked-preference-storage";

/**
 * The docked-rail preference (epic #87, item 4).
 *
 * Whether the user prefers the persistent right-side docked rail over the
 * in-place float/sheet surfaces. It defaults to `"off"`, which makes the
 * unified {@link useEditingSurface} resolve to exactly today's float/sheet
 * behaviour (verified byte-for-byte by the 24-row matrix). The preference is
 * persisted in `localStorage` under {@link DOCKED_PREFERENCE_STORAGE_KEY} and
 * read back on mount.
 *
 * Two contexts are exposed so consumers can read the value and flip it
 * independently:
 *   - {@link useDockedPreference} -> the current `"on" | "off"` value.
 *   - {@link useToggleDockedPreference} -> a stable toggle callback.
 */
const DockedPreferenceContext = createContext<DockedPreference>("off");

const ToggleDockedPreferenceContext = createContext<() => void>(
  () => undefined,
);

// ---------------------------------------------------------------------------
// localStorage-backed external store (read via useSyncExternalStore).
//
// Using an external store (rather than useState + a sync useEffect) keeps the
// read SSR-safe AND hydration-safe: getServerSnapshot returns the default
// "off" on the server and during hydration, after which getSnapshot reads the
// persisted value — so the first paint matches the server markup (progressive
// enhancement, mirroring how `useIsPointerFine` starts from a stable SSR
// default and resolves the real value on the client).
// ---------------------------------------------------------------------------

const storeListeners = new Set<() => void>();

function readStoredPreference(): DockedPreference {
  if (typeof window === "undefined") return "off";
  try {
    return parseStoredDockedPreference(
      window.localStorage.getItem(DOCKED_PREFERENCE_STORAGE_KEY),
    );
  } catch {
    return "off";
  }
}

function subscribeToPreference(onChange: () => void): () => void {
  storeListeners.add(onChange);
  // `storage` fires for changes made in *other* tabs/windows, keeping them in
  // sync; same-tab toggles notify via the local listener set below.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onChange);
  }
  return () => {
    storeListeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onChange);
    }
  };
}

function writePreference(next: DockedPreference): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DOCKED_PREFERENCE_STORAGE_KEY, next);
    } catch {
      // Best-effort persistence; ignore storage failures (private mode, etc.)
    }
  }
  storeListeners.forEach((listener) => listener());
}

/**
 * A localStorage-backed controller for the docked preference. SSR default is
 * `"off"`; the persisted value is read on the client. Every toggle persists the
 * new value and notifies subscribers. Returns the `{ value, toggle }` pair the
 * provider wires into context.
 */
export function useDockedPreferenceController(): {
  value: DockedPreference;
  toggle: () => void;
} {
  const value = useSyncExternalStore(
    subscribeToPreference,
    readStoredPreference,
    (): DockedPreference => "off",
  );

  const toggle = useCallback(() => {
    writePreference(toggleDockedPreference(readStoredPreference()));
  }, []);

  return { value, toggle };
}

/**
 * Provides the docked-rail preference (and its toggle) to the surface tree.
 * Defaults to a static `"off"` with a no-op toggle so callers are safe without
 * a controller; the editor mounts it with {@link useDockedPreferenceController}
 * to back it with real, persisted state.
 */
export function DockedPreferenceProvider({
  value = "off",
  toggle,
  children,
}: {
  value?: DockedPreference;
  toggle?: () => void;
  children: ReactNode;
}) {
  return (
    <DockedPreferenceContext.Provider value={value}>
      <ToggleDockedPreferenceContext.Provider
        value={toggle ?? (() => undefined)}
      >
        {children}
      </ToggleDockedPreferenceContext.Provider>
    </DockedPreferenceContext.Provider>
  );
}

/**
 * Reads the current docked-rail preference. Returns `"off"` when no provider is
 * mounted, so callers are safe to use it unconditionally.
 */
export function useDockedPreference(): DockedPreference {
  return useContext(DockedPreferenceContext);
}

/**
 * Returns a callback that flips the docked-rail preference. A no-op when no
 * provider is mounted.
 */
export function useToggleDockedPreference(): () => void {
  return useContext(ToggleDockedPreferenceContext);
}
