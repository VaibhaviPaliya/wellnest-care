import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DB } from "./store";

/**
 * Demo cross-device sync (FR2, FR7).
 *
 * Bookings, partners and alerts still live in each browser's local mock database. When a person turns on
 * "Use on two phones" and enters the same room code on both devices, every change to the shared demo data
 * is broadcast to the other devices in that room over a realtime channel; the newest version wins.
 * Who is signed in stays per device. Uploaded files (prescriptions, medical records) never leave the device.
 * This is test-data plumbing, not production storage: anyone with the room code receives the demo data.
 */
export const SYNC_KEY = "wellnest-sync";
export const SHARED_KEYS = [
  "users",
  "coaches",
  "kitchens",
  "dishes",
  "pharmacies",
  "delivery",
  "bookings",
  "notices",
  "care",
] as const;
const MAX_BYTES = 400_000;

export type Shared = Pick<DB, (typeof SHARED_KEYS)[number] | "updatedAt">;
export interface SyncSettings {
  enabled: boolean;
  room: string;
}
export interface SyncStatus {
  settings: SyncSettings;
  state: "off" | "connecting" | "live" | "error";
  peers: number;
  lastSync?: string;
  save: (s: SyncSettings) => string | null;
}

export const validRoom = (room: string) => /^[A-Za-z0-9-]{6,32}$/.test(room.trim());

export function sharedChanged(a: DB, b: DB): boolean {
  return SHARED_KEYS.some((k) => a[k] !== b[k]);
}

/** The part of the database that is shared, without uploaded files. */
export function toShared(db: DB): Shared {
  return {
    updatedAt: db.updatedAt,
    users: db.users.map((u) =>
      u.health?.records?.length
        ? {
            ...u,
            health: { ...u.health, records: u.health.records.map((r) => ({ ...r, data: "" })) },
          }
        : u,
    ),
    coaches: db.coaches,
    kitchens: db.kitchens,
    dishes: db.dishes,
    pharmacies: db.pharmacies,
    delivery: db.delivery,
    bookings: db.bookings.map(({ prescriptionData: _omit, ...b }) => b),
    notices: db.notices,
    care: db.care,
  };
}

/** Applies a newer remote version, keeping this device's sign-in and any files that only exist here. */
export function mergeRemote(local: DB, remote: Shared): DB {
  if (!remote || typeof remote.updatedAt !== "number" || remote.updatedAt <= local.updatedAt)
    return local;
  if (
    !SHARED_KEYS.every((k) =>
      k === "care" ? remote.care && typeof remote.care === "object" : Array.isArray(remote[k]),
    )
  )
    return local;
  const files = new Map(
    local.bookings.filter((b) => b.prescriptionData).map((b) => [b.id, b.prescriptionData]),
  );
  const records = new Map(
    local.users.flatMap((u) => u.health?.records ?? []).map((r) => [r.id, r.data]),
  );
  const users = remote.users.map((u) =>
    u.health?.records?.length
      ? {
          ...u,
          health: {
            ...u.health,
            records: u.health.records.map((r) => ({
              ...r,
              data: r.data || records.get(r.id) || "",
            })),
          },
        }
      : u,
  );
  const known = new Set(users.map((u) => u.id));
  const signedIn =
    local.currentUserId && known.has(local.currentUserId) ? local.currentUserId : null;
  return {
    ...local,
    ...remote,
    users,
    care: { ...local.care, ...remote.care },
    bookings: remote.bookings.map((b) =>
      files.has(b.id) ? { ...b, prescriptionData: files.get(b.id) } : b,
    ),
    currentUserId: signedIn,
    activeSeniorId: signedIn ? local.activeSeniorId : null,
  };
}

function readSettings(): SyncSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
    if (s && typeof s.enabled === "boolean" && typeof s.room === "string") return s;
  } catch {
    /* storage unavailable */
  }
  return { enabled: false, room: "" };
}

export function useDemoSync(
  db: DB,
  setDb: Dispatch<SetStateAction<DB>>,
  ready: boolean,
): SyncStatus {
  const [settings, setSettings] = useState<SyncSettings>({ enabled: false, room: "" });
  const [state, setState] = useState<SyncStatus["state"]>("off");
  const [peers, setPeers] = useState(0);
  const [lastSync, setLastSync] = useState<string>();
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const latest = useRef(db);
  latest.current = db;
  const sentAt = useRef(0);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  const send = useCallback(() => {
    const ch = channel.current;
    const d = latest.current;
    if (!ch || !d.updatedAt) return;
    const payload = toShared(d);
    if (JSON.stringify(payload).length > MAX_BYTES) {
      setState("error");
      return;
    }
    sentAt.current = d.updatedAt;
    void ch.send({ type: "broadcast", event: "state", payload });
  }, []);

  // Join the room's channel while sync is on.
  useEffect(() => {
    if (!ready || !settings.enabled || !validRoom(settings.room)) {
      setState("off");
      setPeers(0);
      return;
    }
    setState("connecting");
    const me = Math.random().toString(36).slice(2);
    const ch = supabase.channel(`wellnest-demo-${settings.room.trim().toLowerCase()}`, {
      config: { broadcast: { self: false }, presence: { key: me } },
    });
    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      setDb((d) => {
        const merged = mergeRemote(d, payload as Shared);
        if (merged !== d) {
          sentAt.current = merged.updatedAt;
          setLastSync(new Date().toISOString());
        }
        return merged;
      });
    })
      .on("broadcast", { event: "hello" }, () => send())
      .on("presence", { event: "sync" }, () =>
        setPeers(Math.max(0, Object.keys(ch.presenceState()).length - 1)),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setState("live");
          void ch.track({ at: Date.now() });
          void ch.send({ type: "broadcast", event: "hello", payload: {} });
          send();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState("error");
      });
    channel.current = ch;
    return () => {
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [ready, settings, setDb, send]);

  // Broadcast local changes (debounced); versions that just arrived from a peer are not echoed back.
  useEffect(() => {
    if (state !== "live" || !db.updatedAt || db.updatedAt === sentAt.current) return;
    const t = setTimeout(send, 400);
    return () => clearTimeout(t);
  }, [db.updatedAt, state, send]);

  const save = useCallback((s: SyncSettings) => {
    if (s.enabled && !validRoom(s.room)) return "Room code: 6–32 letters, numbers or dashes.";
    const next = { enabled: s.enabled, room: s.room.trim() };
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    setSettings(next);
    return null;
  }, []);

  return { settings, state, peers, lastSync, save };
}
