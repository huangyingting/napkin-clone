import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

import { adjustIndex, applyTextDiff, colorFromId } from "./y-text";
import { resolveCollabWsUrl } from "./ws-url";

/** Falls back to degraded (local-only) mode if the server never syncs. */
const DEGRADED_TIMEOUT_MS = 2500;

/** Transaction origin tags so observers can classify the source of a change. */
const LOCAL_ORIGIN = Symbol("napkin-local");
const SEED_ORIGIN = Symbol("napkin-seed");

export type CollabStatus = "connecting" | "connected" | "disconnected";

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  self: boolean;
};

type Awareness = WebsocketProvider["awareness"];

export type Collaboration = {
  doc: Y.Doc;
  ycontent: Y.Text;
  ytitle: Y.Text;
  ystate: Y.Map<unknown>;
  status: CollabStatus;
  /** True once the initial server sync (or degraded fallback) has happened. */
  ready: boolean;
  /** True specifically when connected and synced (not degraded). */
  synced: boolean;
  peers: Peer[];
  localOrigin: symbol;
  /** Seeds shared state from the DB once, guarded so peers don't double-seed. */
  seed: (values: {
    content: string;
    title: string;
    visual: string | null;
  }) => void;
};

function computePeers(awareness: Awareness): Peer[] {
  const self = awareness.clientID;
  const peers: Peer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = (state as { user?: { name?: string; color?: string } }).user;
    if (user && typeof user.name === "string") {
      peers.push({
        clientId,
        name: user.name,
        color: user.color ?? colorFromId(clientId),
        self: clientId === self,
      });
    }
  });
  // Stable order: self first, then by join order (clientId).
  peers.sort((a, b) => {
    if (a.self !== b.self) {
      return a.self ? -1 : 1;
    }
    return a.clientId - b.clientId;
  });
  return peers;
}

/**
 * Sets up a Yjs document synced over a self-hosted y-websocket server for one
 * document "room". The Y.Doc and its shared types are created eagerly (so the
 * binding hooks always have stable references), while the websocket provider is
 * created on the client in an effect. Exposes presence, connection status, and a
 * one-time `seed` that loads the DB content into the room.
 */
export function useCollaboration(opts: {
  room: string;
  userName: string;
}): Collaboration {
  const { room, userName } = opts;

  // Created once; `getText`/`getMap` return the same instance for a given doc.
  const [doc] = useState(() => new Y.Doc());
  const ycontent = doc.getText("content");
  const ytitle = doc.getText("title");
  const ystate = doc.getMap<unknown>("state");

  const providerRef = useRef<WebsocketProvider | null>(null);
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const wsUrl = resolveCollabWsUrl();
    const provider = new WebsocketProvider(wsUrl, room, doc);
    providerRef.current = provider;
    const awareness = provider.awareness;

    const onStatus = (event: { status: CollabStatus }) => {
      setStatus(event.status);
    };
    const onSync = (isSynced: boolean) => {
      if (isSynced) {
        setSynced(true);
      }
    };
    const onAwareness = () => {
      setPeers(computePeers(awareness));
    };

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    awareness.on("change", onAwareness);

    const degradeTimer = setTimeout(
      () => setDegraded(true),
      DEGRADED_TIMEOUT_MS,
    );

    return () => {
      clearTimeout(degradeTimer);
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      awareness.off("change", onAwareness);
      awareness.setLocalState(null);
      provider.destroy();
      providerRef.current = null;
    };
  }, [doc, room]);

  // Publish (and keep updated) this client's presence identity.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) {
      return;
    }
    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: colorFromId(provider.awareness.clientID),
    });
  }, [userName, status]);

  const ready = synced || degraded;

  const seededRef = useRef(false);
  const seed = useCallback(
    (values: { content: string; title: string; visual: string | null }) => {
      if (seededRef.current) {
        return;
      }
      seededRef.current = true;

      const meta = doc.getMap<unknown>("meta");
      if (meta.get("seeded")) {
        return;
      }
      doc.transact(() => {
        meta.set("seeded", true);
        if (ycontent.length === 0 && values.content) {
          ycontent.insert(0, values.content);
        }
        if (ytitle.length === 0 && values.title) {
          ytitle.insert(0, values.title);
        }
        if (!ystate.has("visual") && values.visual) {
          ystate.set("visual", values.visual);
        }
      }, SEED_ORIGIN);
    },
    [doc, ycontent, ytitle, ystate],
  );

  return {
    doc,
    ycontent,
    ytitle,
    ystate,
    status,
    ready,
    synced,
    peers,
    localOrigin: LOCAL_ORIGIN,
    seed,
  };
}

type EditableElement = HTMLTextAreaElement | HTMLInputElement;

/**
 * Two-way binds a `Y.Text` to a controlled `<textarea>`/`<input>`.
 *
 * - Local edits are applied to the shared text as a minimal diff (so concurrent
 *   edits merge) and reported via `onLocalChange` for DB persistence.
 * - Remote edits update the controlled value and preserve the user's caret by
 *   re-mapping it through the change delta.
 *
 * Until collaboration is `ready` (seeded), the DB `initial` value is shown; the
 * caller keeps the element read-only via `editable`.
 */
export function useYText(
  ytext: Y.Text,
  options: {
    initial: string;
    ready: boolean;
    editable: boolean;
    localOrigin: symbol;
    elementRef: React.RefObject<EditableElement | null>;
    onLocalChange?: (value: string) => void;
  },
): { value: string; onChange: (next: string) => void } {
  const { initial, ready, editable, localOrigin, elementRef, onLocalChange } =
    options;
  const [liveValue, setLiveValue] = useState("");
  const pendingCursor = useRef<{ start: number; end: number } | null>(null);
  const onLocalChangeRef = useRef(onLocalChange);

  useEffect(() => {
    onLocalChangeRef.current = onLocalChange;
  }, [onLocalChange]);

  useEffect(() => {
    const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      const next = ytext.toString();
      const isLocal = transaction.origin === localOrigin;

      if (!isLocal) {
        const el = elementRef.current;
        if (
          el &&
          typeof el.selectionStart === "number" &&
          typeof el.selectionEnd === "number" &&
          el.ownerDocument.activeElement === el
        ) {
          pendingCursor.current = {
            start: adjustIndex(el.selectionStart, event.delta),
            end: adjustIndex(el.selectionEnd, event.delta),
          };
        }
      }

      setLiveValue(next);

      if (isLocal) {
        onLocalChangeRef.current?.(next);
      }
    };

    ytext.observe(observer);
    return () => ytext.unobserve(observer);
  }, [ytext, localOrigin, elementRef]);

  // Restore the re-mapped caret after a remote edit re-renders the element.
  useLayoutEffect(() => {
    const cursor = pendingCursor.current;
    const el = elementRef.current;
    if (cursor && el) {
      el.setSelectionRange(cursor.start, cursor.end);
      pendingCursor.current = null;
    }
  });

  const onChange = useCallback(
    (next: string) => {
      if (!editable) {
        return;
      }
      setLiveValue(next);
      const current = ytext.toString();
      if (current !== next) {
        applyTextDiff(ytext, current, next, localOrigin);
      }
    },
    [ytext, editable, localOrigin],
  );

  // Before the room is seeded, show the DB value; afterwards the shared text is
  // the single source of truth (so "delete everything" stays empty).
  const value = ready ? liveValue : initial;

  return { value, onChange };
}

type SaveStatus = "saved" | "pending" | "saving";

/**
 * Debounced persistence for a string value with a coarse save status. Used to
 * push collaborative changes down to the database (the durable source of truth)
 * without a save per keystroke.
 */
export function useDebouncedSave(
  save: (value: string) => Promise<unknown>,
  initial: string,
  delay = 800,
): {
  status: SaveStatus;
  schedule: (value: string) => void;
  flush: () => void;
} {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>(null);
  const saved = useRef<string>(initial);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const run = useCallback(async () => {
    const toSave = latest.current;
    if (toSave == null || toSave === saved.current) {
      return;
    }
    setStatus("saving");
    try {
      await saveRef.current(toSave);
      saved.current = toSave;
      setStatus(latest.current === toSave ? "saved" : "pending");
    } catch {
      setStatus("pending");
    }
  }, []);

  const schedule = useCallback(
    (value: string) => {
      latest.current = value;
      if (value === saved.current) {
        setStatus("saved");
        return;
      }
      setStatus("pending");
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, delay);
    },
    [delay, run],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void run();
  }, [run]);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return { status, schedule, flush };
}

export function combineSaveStatus(...statuses: SaveStatus[]): SaveStatus {
  if (statuses.includes("saving")) {
    return "saving";
  }
  if (statuses.includes("pending")) {
    return "pending";
  }
  return "saved";
}
