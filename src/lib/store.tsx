import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  seedBookings, seedCoaches, seedDishes, seedKitchens, seedMedicines, seedNotices, seedPharmacies, seedUsers,
  type Booking, type Coach, type DietTag, type Dish, type HealthProfile, type Kitchen, type Notice, type Pharmacy, type Role, type Status, type User,
} from "./seed";

export interface DB {
  users: User[]; coaches: Coach[]; kitchens: Kitchen[]; dishes: Dish[]; pharmacies: Pharmacy[];
  bookings: Booking[]; notices: Notice[]; currentUserId: string | null; activeSeniorId: string | null;
}
const KEY = "wellnest-db-v1";
const fresh = (): DB => ({
  users: seedUsers, coaches: seedCoaches, kitchens: seedKitchens, dishes: seedDishes, pharmacies: seedPharmacies,
  bookings: seedBookings, notices: seedNotices, currentUserId: null, activeSeniorId: null,
});
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

interface Ctx {
  ready: boolean; db: DB; me: User | null; senior: User | null; medicines: typeof seedMedicines;
  login: (phone: string) => User | null;
  register: (phone: string, name: string, role: Role) => User;
  logout: () => void;
  giveConsent: () => void;
  saveHealth: (h: HealthProfile, address?: string) => void;
  deleteHealthData: () => void;
  linkSenior: (phone: string) => string | null;
  setActiveSenior: (id: string) => void;
  createBooking: (b: Omit<Booking, "id" | "createdAt" | "status" | "seniorId" | "bookedBy" | "upiRef">) => Booking;
  setStatus: (id: string, s: Status) => void;
  review: (id: string, rating: number, text: string) => void;
  markRead: () => void;
  toggleVerify: (kind: "coaches" | "kitchens" | "pharmacies", id: string) => void;
  toggleDishTag: (dishId: string, tag: DietTag) => void;
  resetDemo: () => void;
}
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(fresh);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setDb(JSON.parse(raw)); } catch { /* ignore */ }
    setReady(true);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) setDb(JSON.parse(e.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(db)); }, [db, ready]);

  const me = db.users.find((u) => u.id === db.currentUserId) ?? null;
  const senior = me?.role === "senior" ? me
    : me?.role === "family" ? db.users.find((u) => u.id === (db.activeSeniorId ?? me.linkedSeniorIds[0])) ?? null
    : null;

  const update = useCallback((fn: (d: DB) => DB) => setDb((d) => fn(d)), []);
  const patchMe = (fn: (u: User) => User) =>
    update((d) => ({ ...d, users: d.users.map((u) => (u.id === d.currentUserId ? fn(u) : u)) }));

  const notifyAll = (d: DB, seniorId: string, title: string, body: string): Notice[] => {
    const targets = [seniorId, ...d.users.filter((u) => u.linkedSeniorIds.includes(seniorId)).map((u) => u.id)];
    const at = new Date().toISOString();
    return [...targets.map((userId) => ({ id: uid("n"), userId, title, body, at, read: false })), ...d.notices];
  };

  const value: Ctx = useMemo(() => ({
    ready, db, me, senior, medicines: seedMedicines,
    login: (phone) => {
      const u = db.users.find((x) => x.phone === phone) ?? null;
      if (u) update((d) => ({ ...d, currentUserId: u.id, activeSeniorId: u.linkedSeniorIds[0] ?? null }));
      return u;
    },
    register: (phone, name, role) => {
      const u: User = { id: uid("u"), phone, name, role, linkedSeniorIds: [] };
      update((d) => ({ ...d, users: [...d.users, u], currentUserId: u.id }));
      return u;
    },
    logout: () => update((d) => ({ ...d, currentUserId: null, activeSeniorId: null })),
    giveConsent: () => patchMe((u) => ({ ...u, consent: { given: true, at: new Date().toISOString() } })),
    saveHealth: (h, address) => patchMe((u) => ({ ...u, health: h, address: address ?? u.address })),
    deleteHealthData: () => patchMe((u) => ({ ...u, health: undefined, consent: undefined })),
    linkSenior: (phone) => {
      const s = db.users.find((u) => u.phone === phone && u.role === "senior");
      if (!s) return "No senior account found with that number.";
      if (me?.linkedSeniorIds.includes(s.id)) return "Already linked.";
      update((d) => ({
        ...d, activeSeniorId: s.id,
        users: d.users.map((u) => (u.id === d.currentUserId ? { ...u, linkedSeniorIds: [...u.linkedSeniorIds, s.id] } : u)),
        notices: [{ id: uid("n"), userId: s.id, title: "Family member linked", body: `${me?.name} can now see your bookings and receive alerts.`, at: new Date().toISOString(), read: false }, ...d.notices],
      }));
      return null;
    },
    setActiveSenior: (id) => update((d) => ({ ...d, activeSeniorId: id })),
    createBooking: (b) => {
      const sid = senior!.id;
      const booking: Booking = { ...b, id: uid("b"), createdAt: new Date().toISOString(), status: "confirmed", seniorId: sid, bookedBy: me!.id, upiRef: "UPI" + Math.floor(1e6 + Math.random() * 9e6) };
      const who = me!.id === sid ? senior!.name : `${me!.name} (for ${senior!.name})`;
      update((d) => ({ ...d, bookings: [booking, ...d.bookings], notices: notifyAll(d, sid, `${b.type === "fitness" ? "Session booked" : "Order confirmed"}: ${b.title}`, `${who} · ${b.partnerName} · ₹${b.amount} paid via UPI`) }));
      return booking;
    },
    setStatus: (id, s) => update((d) => {
      const b = d.bookings.find((x) => x.id === id)!;
      const label = { confirmed: "Confirmed", in_progress: "Being prepared", out_for_delivery: "Out for delivery", completed: "Completed", cancelled: "Cancelled", pending_review: "Pharmacy reviewing" }[s];
      return { ...d, bookings: d.bookings.map((x) => (x.id === id ? { ...x, status: s } : x)), notices: notifyAll(d, b.seniorId, `${b.title}: ${label}`, `Update from ${b.partnerName}`) };
    }),
    review: (id, rating, text) => update((d) => ({ ...d, bookings: d.bookings.map((x) => (x.id === id ? { ...x, review: { rating, text } } : x)) })),
    markRead: () => update((d) => ({ ...d, notices: d.notices.map((n) => (n.userId === d.currentUserId ? { ...n, read: true } : n)) })),
    toggleVerify: (kind, id) => update((d) => ({ ...d, [kind]: (d[kind] as { id: string; verified: boolean }[]).map((x) => (x.id === id ? { ...x, verified: !x.verified } : x)) })),
    toggleDishTag: (dishId, tag) => update((d) => ({ ...d, dishes: d.dishes.map((x) => (x.id === dishId ? { ...x, tags: x.tags.includes(tag) ? x.tags.filter((t) => t !== tag) : [...x.tags, tag] } : x)) })),
    resetDemo: () => setDb(fresh()),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, ready, me, senior]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
