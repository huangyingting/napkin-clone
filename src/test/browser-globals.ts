export const browserGlobalKeys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "File",
  "ResizeObserver",
  "setTimeout",
  "clearTimeout",
] as const;

export type BrowserGlobalKey = (typeof browserGlobalKeys)[number];

type BrowserGlobalRecord = Partial<Record<BrowserGlobalKey, unknown>>;

export function createBrowserGlobalInstaller(
  keys: readonly BrowserGlobalKey[] = browserGlobalKeys,
) {
  const globalRef = globalThis as typeof globalThis & BrowserGlobalRecord;
  const previous = new Map<PropertyKey, PropertyDescriptor | undefined>(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalRef, key)]),
  );

  return {
    globalRef,
    define(key: BrowserGlobalKey, value: unknown): void {
      Object.defineProperty(globalRef, key, {
        configurable: true,
        writable: true,
        value,
      });
    },
    restore(): void {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalRef, key, descriptor);
        else Reflect.deleteProperty(globalRef, key);
      }
    },
  };
}
