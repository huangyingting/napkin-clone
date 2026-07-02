import assert from "node:assert/strict";
import * as React from "react";

type ReactClientInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

export type ReactTestDispatcher = Record<string, unknown>;

export type ReactHookRendererOptions = {
  firstRefCurrent?: unknown;
  idPrefix?: string;
  message?: string;
  preferServerSnapshot?: boolean;
  requireInternals?: boolean;
  runEffects?: boolean;
  runInsertionEffects?: boolean;
  runLayoutEffects?: boolean;
};

export function withReactTestDispatcher<T>(
  dispatcher: ReactTestDispatcher,
  render: () => T,
  {
    message = "React internals were unavailable for hook rendering.",
    requireInternals = true,
  }: { message?: string; requireInternals?: boolean } = {},
): T {
  const internals = (React as unknown as ReactClientInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) {
    if (!requireInternals) return render();
    assert.fail(message);
  }

  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return render();
  } finally {
    internals.H = previous;
  }
}

export function createReactHookRenderer({
  firstRefCurrent,
  idPrefix = "fake-react-id",
  message,
  preferServerSnapshot = false,
  requireInternals = true,
  runEffects = false,
  runInsertionEffects = false,
  runLayoutEffects = false,
}: ReactHookRendererOptions = {}) {
  const slots: unknown[] = [];
  const cleanups: (() => void)[] = [];

  return {
    run<T>(render: () => T): T {
      let hookIndex = 0;
      const dispatcher = {
        useState: <S>(initial: S | (() => S)) => {
          const slotIndex = hookIndex++;
          if (!(slotIndex in slots)) {
            slots[slotIndex] =
              typeof initial === "function" ? (initial as () => S)() : initial;
          }
          const setState = (next: S | ((previousState: S) => S)) => {
            const previousState = slots[slotIndex] as S;
            slots[slotIndex] =
              typeof next === "function"
                ? (next as (previousState: S) => S)(previousState)
                : next;
          };
          return [slots[slotIndex] as S, setState] as const;
        },
        useReducer: <S, A, I = S>(
          reducer: (state: S, action: A) => S,
          initialArg: I,
          init?: (arg: I) => S,
        ) => {
          const slotIndex = hookIndex++;
          if (!(slotIndex in slots)) {
            slots[slotIndex] = init
              ? init(initialArg)
              : (initialArg as unknown as S);
          }
          const dispatch = (action: A) => {
            slots[slotIndex] = reducer(slots[slotIndex] as S, action);
          };
          return [slots[slotIndex] as S, dispatch] as const;
        },
        useRef: <T>(initial: T) => {
          const slotIndex = hookIndex++;
          if (!(slotIndex in slots)) {
            slots[slotIndex] = {
              current:
                slotIndex === 0 && firstRefCurrent !== undefined
                  ? firstRefCurrent
                  : initial,
            };
          }
          return slots[slotIndex] as { current: T };
        },
        useMemo: <T>(factory: () => T) => {
          hookIndex++;
          return factory();
        },
        useCallback: <T>(callback: T) => {
          hookIndex++;
          return callback;
        },
        useId: () => {
          const slotIndex = hookIndex++;
          if (!(slotIndex in slots))
            slots[slotIndex] = `${idPrefix}-${slotIndex}`;
          return slots[slotIndex] as string;
        },
        useContext: () => {
          hookIndex++;
          return undefined;
        },
        useEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (!runEffects) return;
          const cleanup = effect?.();
          if (typeof cleanup === "function") cleanups.push(cleanup);
        },
        useLayoutEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (!runLayoutEffects) return;
          const cleanup = effect?.();
          if (typeof cleanup === "function") cleanups.push(cleanup);
        },
        useInsertionEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (!runInsertionEffects) return;
          const cleanup = effect?.();
          if (typeof cleanup === "function") cleanups.push(cleanup);
        },
        useSyncExternalStore: <T>(
          _subscribe: (_callback: () => void) => () => void,
          getSnapshot: () => T,
          getServerSnapshot?: () => T,
        ) => {
          hookIndex++;
          return preferServerSnapshot && getServerSnapshot
            ? getServerSnapshot()
            : getSnapshot();
        },
        useTransition: () => {
          hookIndex++;
          return [false, (callback?: () => void) => callback?.()] as const;
        },
        useDeferredValue: <T>(value: T) => {
          hookIndex++;
          return value;
        },
        useImperativeHandle: () => {
          hookIndex++;
        },
      };
      return withReactTestDispatcher(dispatcher, render, {
        message,
        requireInternals,
      });
    },
    cleanup(): void {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
