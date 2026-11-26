// Lovable Cloud persistence for the app store.
// The store keeps its rules and in-memory model; this module loads what the signed-in user may see
// (row-level security decides) and turns each local change into the matching insert / update / delete.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { DB } from "./store";
import type { Booking, Coach, DeliveryPartner, Dish, HealthProfile, Kitchen, Notice, Pharmacy, User } from "./seed";
import type { CareData, CareRequest, ExercisePlan, Reminder, Subscription } from "./care";

export const PHONE_EMAIL_DOMAIN = "phone.wellnest.app";
export const phoneEmail = (phone: string) => `${phone}@${PHONE_EMAIL_DOMAIN}`;
export const isPhoneEmail = (email: string) => email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`);

type Client = SupabaseClient<Database>;
export type Shared = Pick<DB, "users" | "coaches" | "kitchens" | "dishes" | "pharmacies" | "delivery" | "bookings" | "notices" | "care">;

const CATALOG = { coaches: "coach", kitchens: "kitchen", dishes: "dish", pharmacies: "pharmacy", delivery: "delivery" } as const;
type CatalogKey = keyof typeof CATALOG;
type CareKind = "reminder" | "subscription" | "request" | "completion" | "booking_alert";
type Completion = CareData["completions"][number];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const json = (x: unknown) => x as Json;
export const completionId = (c: Completion) => `done:${c.seniorId}:${c.planId}:${c.date}:${c.day}`;
export const alertId = (bookingId: string) => `alert:${bookingId}`;

// ---------- loading ----------

type CloudPerson = Database["public"]["Functions"]["visible_people"]["Returns"][number];
// Generated RPC types omit SQL nullability for optional profile fields.
type Person = { [K in keyof CloudPerson]: CloudPerson[K] | null } & Pick<CloudPerson, "id" | "name">;
export function toUser(p: Person): User {
  return {
    id: p.id, name: p.name, phone: p.phone ?? "", role: p.role ?? "family",
    username: p.username ?? undefined, email: p.email && !isPhoneEmail(p.email) ? p.email : undefined,
    age: p.age ?? undefined, city: p.city ?? undefined, address: p.address ?? undefined,
    consent: p.consent_at ? { given: true, at: p.consent_at } : undefined,
    health: (p.health ?? undefined) as HealthProfile | undefined,
    linkedSeniorIds: p.linked_senior_ids ?? [],
  };
}

export async function loadCloud(client: Client): Promise<Shared> {
  const [people, catalog, bookings, notices, care] = await Promise.all([
    client.rpc("visible_people"),
    client.from("catalog").select("kind,id,ord,data").neq("kind", "meta").order("ord"),
    client.from("bookings").select("data").order("created_at", { ascending: false }),
    client.from("notices").select("id,user_id,data").order("created_at", { ascending: false }),
    client.from("care_items").select("id,kind,senior_id,data"),
  ]);
  const err = people.error ?? catalog.error ?? bookings.error ?? notices.error ?? care.error;
  if (err) throw new Error(err.message);
  const of = <T,>(kind: string) => (catalog.data ?? []).filter((r) => r.kind === kind).map((r) => r.data as unknown as T);
  const careOf = <T,>(kind: CareKind) => (care.data ?? []).filter((r) => r.kind === kind).map((r) => r.data as unknown as T);
  return {
    users: (people.data ?? []).map(toUser),
    coaches: of<Coach>("coach"), kitchens: of<Kitchen>("kitchen"), dishes: of<Dish>("dish"),
    pharmacies: of<Pharmacy>("pharmacy"), delivery: of<DeliveryPartner>("delivery"),
    bookings: (bookings.data ?? []).map((r) => r.data as unknown as Booking),
    notices: (notices.data ?? []).map((r) => ({ ...(r.data as unknown as Omit<Notice, "id" | "userId">), id: r.id, userId: r.user_id })),
    care: {
      plans: of<ExercisePlan>("plan"),
      reminders: careOf<Reminder>("reminder"),
      subscriptions: careOf<Subscription>("subscription"),
      requests: careOf<CareRequest>("request"),
      completions: careOf<Completion>("completion"),
      bookingAlerts: careOf<{ bookingId: string }>("booking_alert").map((a) => a.bookingId),
    },
  };
}

// ---------- writing ----------

export type Op =
  | { t: "profile"; values: Database["public"]["Tables"]["profiles"]["Update"] }
  | { t: "seniorProfile"; senior: string; health: HealthProfile | null; address: string | null }
  | { t: "unlink"; family: string; senior: string }
  | { t: "catalog"; rows: { kind: string; id: string; ord: number; data: Json }[] }
  | { t: "insert"; table: "bookings" | "notices" | "care_items"; rows: Record<string, unknown>[] }
  | { t: "update"; table: "bookings" | "notices" | "care_items"; id: string; values: Record<string, unknown> }
  | { t: "delete"; table: "care_items" | "notices"; ids: string[] };

function byId<T>(items: T[], key: (x: T) => string) { return new Map(items.map((x) => [key(x), x])); }

/** Rows of one table that were added, changed or removed between two states. */
function changes<T>(prev: T[], next: T[], key: (x: T) => string) {
  const before = byId(prev, key), after = byId(next, key);
  const added: T[] = [], changed: T[] = [], removed: string[] = [];
  for (const [k, v] of after) { const old = before.get(k); if (!old) added.push(v); else if (!same(old, v)) changed.push(v); }
  for (const k of before.keys()) if (!after.has(k)) removed.push(k);
  return { added, changed, removed };
}

function careRows(d: DB): { id: string; kind: CareKind; senior_id: string; data: unknown }[] {
  const seniorOfBooking = (id: string) => d.bookings.find((b) => b.id === id)?.seniorId;
  return [
    ...d.care.reminders.map((x) => ({ id: x.id, kind: "reminder" as const, senior_id: x.seniorId, data: x })),
    ...d.care.subscriptions.map((x) => ({ id: x.id, kind: "subscription" as const, senior_id: x.seniorId, data: x })),
    ...d.care.requests.map((x) => ({ id: x.id, kind: "request" as const, senior_id: x.seniorId, data: x })),
    ...d.care.completions.map((x) => ({ id: completionId(x), kind: "completion" as const, senior_id: x.seniorId, data: x })),
    ...d.care.bookingAlerts.flatMap((b) => { const s = seniorOfBooking(b); return s ? [{ id: alertId(b), kind: "booking_alert" as const, senior_id: s, data: { bookingId: b } }] : []; }),
  ];
}

/** Turns the difference between the last saved state and the new state into Cloud writes. */
export function planWrites(prev: DB, next: DB, meId: string): Op[] {
  const ops: Op[] = [];
  // People: own profile, a linked senior's health, removed family links
  for (const u of next.users) {
    const old = prev.users.find((x) => x.id === u.id);
    if (!old) continue;
    if (u.id === meId) {
      const pick = (x: User) => [x.name, x.username, x.phone, x.age, x.city, x.address, x.consent?.at, x.health];
      if (!same(pick(old), pick(u))) ops.push({ t: "profile", values: {
        name: u.name, username: u.username ?? null, phone: u.phone || null, age: u.age ?? null, city: u.city ?? null,
        address: u.address ?? null, consent_at: u.consent?.at ?? null, health: json(u.health ?? null),
      } });
    } else if (u.role === "senior" && (!same(old.health, u.health) || old.address !== u.address)) {
      ops.push({ t: "seniorProfile", senior: u.id, health: u.health ?? null, address: u.address ?? null });
    }
    for (const s of old.linkedSeniorIds) if (!u.linkedSeniorIds.includes(s)) ops.push({ t: "unlink", family: u.id, senior: s });
  }
  // Partner catalogue and exercise plans (admin only; RLS refuses anyone else)
  const cat: { kind: string; id: string; ord: number; data: Json }[] = [];
  for (const key of Object.keys(CATALOG) as CatalogKey[]) {
    const list = next[key] as { id: string }[];
    const c = changes(prev[key] as { id: string }[], list, (x) => x.id);
    for (const x of [...c.added, ...c.changed]) cat.push({ kind: CATALOG[key], id: x.id, ord: list.indexOf(x), data: json(x) });
  }
  const plans = changes(prev.care.plans, next.care.plans, (x) => x.id);
  for (const x of [...plans.added, ...plans.changed]) cat.push({ kind: "plan", id: x.id, ord: next.care.plans.indexOf(x), data: json(x) });
  if (cat.length) ops.push({ t: "catalog", rows: cat });
  // Bookings: insert new, update changed (status, review, delivery partner)
  const b = changes(prev.bookings, next.bookings, (x) => x.id);
  if (b.added.length) ops.push({ t: "insert", table: "bookings", rows: b.added.map((x) => ({ id: x.id, senior_id: x.seniorId, booked_by: x.bookedBy, data: x })) });
  for (const x of b.changed) ops.push({ t: "update", table: "bookings", id: x.id, values: { data: x } });
  // Alerts: insert new (for the senior and family), mark read, delete own
  const n = changes(prev.notices, next.notices, (x) => x.id);
  const noticeData = ({ id: _id, userId: _u, ...rest }: Notice) => rest;
  if (n.added.length) ops.push({ t: "insert", table: "notices", rows: n.added.map((x) => ({ id: x.id, user_id: x.userId, senior_id: x.seniorId ?? null, data: noticeData(x) })) });
  for (const x of n.changed) ops.push({ t: "update", table: "notices", id: x.id, values: { data: noticeData(x) } });
  const ownRemoved = n.removed.filter((id) => prev.notices.find((x) => x.id === id)?.userId === meId);
  if (ownRemoved.length) ops.push({ t: "delete", table: "notices", ids: ownRemoved });
  // Care items
  const c = changes(careRows(prev), careRows(next), (x) => x.id);
  if (c.added.length) ops.push({ t: "insert", table: "care_items", rows: c.added });
  for (const x of c.changed) ops.push({ t: "update", table: "care_items", id: x.id, values: { data: x.data } });
  if (c.removed.length) ops.push({ t: "delete", table: "care_items", ids: c.removed });
  return ops;
}

export async function runOp(client: Client, op: Op): Promise<void> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  switch (op.t) {
    case "profile": {
      const { data } = await client.auth.getUser();
      if (!data.user) throw new Error("Please sign in again.");
      fail((await client.from("profiles").update(op.values).eq("id", data.user.id)).error);
      return;
    }
    case "seniorProfile": {
      // SQL accepts NULL to clear the address; keep it rather than replacing it with an empty string.
      const args = { _senior: op.senior, _health: json(op.health), _address: op.address };
      fail((await client.rpc("save_senior_profile", args as Database["public"]["Functions"]["save_senior_profile"]["Args"])).error);
      return;
    }
    case "unlink": fail((await client.from("family_links").delete().eq("family_id", op.family).eq("senior_id", op.senior)).error); return;
    case "catalog": fail((await client.from("catalog").upsert(op.rows, { onConflict: "kind,id" })).error); return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "insert": fail((await client.from(op.table).insert(op.rows as any)).error); return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    case "update": fail((await client.from(op.table).update(op.values as any).eq("id", op.id)).error); return;
    case "delete": fail((await client.from(op.table).delete().in("id", op.ids)).error); return;
  }
}

/** Calls back whenever data this user can see changes in Cloud (another phone booked, an admin updated a status). */
export function watchCloud(client: Client, onChange: () => void): () => void {
  const ch = client.channel("wellnest-data");
  for (const table of ["bookings", "notices", "care_items", "catalog", "family_links"]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  ch.subscribe();
  return () => { void client.removeChannel(ch); };
}

/** Readable message for errors from Cloud rules. */
export function cloudMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission denied/i.test(m)) return "You don't have access to change that.";
  if (/profiles_username|duplicate key.*username/i.test(m)) return "That username is taken.";
  if (/profiles_phone_key|duplicate key.*phone/i.test(m)) return "That mobile number is used by another account.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "No connection. Your change was not saved.";
  return m.replace(/^.*?ERROR:\s*/i, "");
}
