import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  seedBookings, seedCoaches, seedDelivery, seedDishes, seedKitchens, seedMedicines, seedNotices, seedPharmacies, seedUsers,
  type Booking, type DeliveryPartner, type PartnerKind, type Coach, type DietTag, type Dish, type HealthProfile, type Kitchen, type Notice, type Pharmacy, type Role, type Status, type User, type ProfileDetails,
} from "./seed";
import { supabase } from "@/integrations/supabase/client";
import { canAccessBooking, canManageSenior, canTransition } from "./booking-rules";
import { sharedChanged, useDemoSync, type SyncStatus } from './sync';
import { EXERCISE_SUBSCRIPTION, arrivalWindow, assignDelivery, bookingsStartingSoon, dueReminders, freshCare, hasActiveSubscription, localDate, safeVideoUrl, validNutrition, validReminder, type CareData, type ExercisePlan, type Nutrition, type Reminder } from './care';

export interface DB {
  users: User[]; coaches: Coach[]; kitchens: Kitchen[]; dishes: Dish[]; pharmacies: Pharmacy[];
  bookings: Booking[]; notices: Notice[]; currentUserId: string | null; activeSeniorId: string | null;
  care: CareData;
  delivery: DeliveryPartner[];
  /** Last local change (ms). Used by demo cross-device sync; 0 = untouched seed data. */
  updatedAt: number;
}
const KEY = "wellnest-db-v1";
const fresh = (): DB => ({
  users: seedUsers, coaches: seedCoaches, kitchens: seedKitchens, dishes: seedDishes, pharmacies: seedPharmacies,
  bookings: seedBookings, notices: seedNotices, currentUserId: null, activeSeniorId: null,
  care: freshCare(), delivery: seedDelivery, updatedAt: 0,
});
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

interface Ctx {
  ready: boolean; db: DB; me: User | null; senior: User | null; medicines: typeof seedMedicines;
  login: (phone: string) => User | null;
  register: (phone: string, name: string, role: Role, extra?: Partial<ProfileDetails>) => User;
  updateProfile: (p: ProfileDetails) => string | null;
  logout: () => void;
  /** Permanently removes the signed-in account after the approval code was checked. */
  deleteAccount: () => string | null;
  /** Records consent and health from the registration flow for a new senior. */
  completeOnboarding: (h: HealthProfile, address: string) => void;
  giveConsent: () => void;
  saveHealth: (h: HealthProfile, address?: string) => void;
  deleteHealthData: () => void;
  linkSenior: (phone: string) => string | null;
  setActiveSenior: (id: string) => void;
  unlinkFamily: (id: string) => void;
  createBooking: (b: Omit<Booking, "id" | "createdAt" | "status" | "seniorId" | "bookedBy" | "upiRef">) => Booking;
  setStatus: (id: string, s: Status) => void;
  review: (id: string, rating: number, text: string) => void;
  markRead: () => void;
  toggleVerify: (kind: "coaches" | "kitchens" | "pharmacies" | "delivery", id: string) => void;
  /** Admin: set or clear a partner photo (small image data URL). */
  setPartnerPhoto: (kind: PartnerKind, id: string, photo: string | undefined) => string | null;
  sync: SyncStatus;
  toggleDishTag: (dishId: string, tag: DietTag) => void;
  resetDemo: () => void;
  saveExercisePlan: (plan: ExercisePlan) => string | null;
  subscribeExercise: (planId: string) => string | null;
  cancelSubscription: (id: string) => void;
  completeExercise: (planId: string, day: string) => void;
  requestCare: (kind: 'therapy' | 'meal', detail: string, partnerId?: string) => string | null;
  decideCare: (id: string, approved: boolean, professional: string, decision: string) => string | null;
  saveDishNutrition: (id: string, nutrition: Nutrition) => string | null;
  addReminder: (r: Pick<Reminder, 'kind' | 'label' | 'time' | 'days'>) => string | null;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  /** Fires due reminders and one-hour booking heads-ups for the managed senior; returns the titles fired. */
  runTimers: (now?: Date) => string[];
  /** Signed in with a real emailed code but has not finished registering yet. */
  pendingCloud: { id: string; email: string } | null;
  completeCloudRegistration: (p: { name: string; username: string; role: Role; age?: number; city?: string }) => Promise<string | null>;
}
const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(fresh);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restore = (raw: string) => {
      const saved = JSON.parse(raw) as DB;
      if (!Array.isArray(saved.users) || !Array.isArray(saved.bookings) || !Array.isArray(saved.notices) || !Array.isArray(saved.coaches) || !Array.isArray(saved.kitchens) || !Array.isArray(saved.dishes) || !Array.isArray(saved.pharmacies)) return;
      setDb({ ...fresh(), ...saved, care: { ...freshCare(), ...saved.care } });
    };
    try { const raw = localStorage.getItem(KEY); if (raw) restore(raw); } catch { /* use fresh demo */ }
    setReady(true);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { try { restore(e.newValue); } catch { /* ignore invalid data */ } } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const [pendingCloud, setPendingCloud] = useState<{ id: string; email: string } | null>(null);
  const adoptCloudUser = useCallback(async (id: string, email: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id),
    ]);
    const role = roles?.find((r) => r.role === "admin")?.role ?? roles?.[0]?.role;
    if (!role || !prof?.username) { setPendingCloud({ id, email }); return; }
    setPendingCloud(null);
    setDb((d) => {
      const prev = d.users.find((u) => u.id === id);
      const u: User = { ...(prev ?? { linkedSeniorIds: [] }), id, email, role, name: prof.name, username: prof.username ?? undefined, phone: prof.phone ?? "", age: prof.age ?? undefined, city: prof.city ?? undefined } as User;
      return { ...d, users: prev ? d.users.map((x) => (x.id === id ? u : x)) : [...d.users, u], currentUserId: id, activeSeniorId: u.linkedSeniorIds[0] ?? null };
    });
  }, []);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { setPendingCloud(null); return; }
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        const u = session.user; setTimeout(() => { void adoptCloudUser(u.id, u.email ?? ""); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [adoptCloudUser]);
  useEffect(() => { if (ready) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } } }, [db, ready]);

  const me = db.users.find((u) => u.id === db.currentUserId) ?? null;
  const senior = me?.role === "senior" ? me
    : me?.role === "family" ? db.users.find((u) => u.id === (me.linkedSeniorIds.includes(db.activeSeniorId ?? "") ? db.activeSeniorId : me.linkedSeniorIds[0]) && u.role === "senior") ?? null
    : null;

  // Only changes to shared data (not who is signed in on this device) count as a newer version for sync.
  const update = useCallback((fn: (d: DB) => DB) => setDb((d) => { const next = fn(d); return next === d || !sharedChanged(d, next) ? next : { ...next, updatedAt: Date.now() }; }), []);
  const sync = useDemoSync(db, setDb, ready);
  const patchMe = (fn: (u: User) => User) =>
    update((d) => ({ ...d, users: d.users.map((u) => (u.id === d.currentUserId ? fn(u) : u)) }));

  const notifyAll = (d: DB, seniorId: string, title: string, body: string, who?: Notice["who"]): Notice[] => {
    const targets = [seniorId, ...d.users.filter((u) => u.linkedSeniorIds.includes(seniorId)).map((u) => u.id)];
    const at = new Date().toISOString();
    return [...targets.map((userId) => ({ id: uid("n"), userId, title, body, at, read: false, ...(who ? { who } : {}) })), ...d.notices];
  };

  const value: Ctx = useMemo(() => ({
    ready, db, me, senior, medicines: seedMedicines, pendingCloud, sync,
    saveExercisePlan: (plan) => {
      if (me?.role !== 'admin') return 'Only administrators can manage plans.';
      if (!plan.name.trim() || !db.coaches.some(c => c.id === plan.coachId && c.verified) || plan.days.length !== 7 || new Set(plan.days.map(d => d.day)).size !== 7 || plan.days.some(d => !d.title.trim() || !Number.isFinite(d.minutes) || d.minutes < 0 || d.minutes > 60 || (d.videoUrl && !safeVideoUrl(d.videoUrl)))) return 'Enter seven days, durations of 0–60 minutes, and HTTPS video links.';
      update(d => ({ ...d, care: { ...d.care, plans: d.care.plans.some(p => p.id === plan.id) ? d.care.plans.map(p => p.id === plan.id ? plan : p) : [...d.care.plans, plan] } }));
      return null;
    },
    subscribeExercise: (planId) => {
      if (!senior?.consent?.given || !senior.health || !canManageSenior(me, senior)) return 'Complete consent and link a senior first.';
      const plan = db.care.plans.find(p => p.id === planId);
      if (!plan || !db.coaches.some(c => c.id === plan.coachId && c.verified)) return 'This plan is not available.';
      if (db.care.subscriptions.some(s => s.seniorId === senior.id && hasActiveSubscription(s))) return 'An exercise subscription is already active.';
      const starts = new Date(); const ends = new Date(starts.getTime() + EXERCISE_SUBSCRIPTION.days * 86400000);
      update(d => ({ ...d, care: { ...d.care, subscriptions: [...d.care.subscriptions, { id: uid('sub'), seniorId: senior.id, planId, starts: starts.toISOString(), ends: ends.toISOString(), remaining: EXERCISE_SUBSCRIPTION.sessions, cancelled: false }] }, notices: notifyAll(d, senior.id, 'Exercise subscription activated', `₹${EXERCISE_SUBSCRIPTION.price} demo UPI · ${EXERCISE_SUBSCRIPTION.sessions} sessions · expires ${ends.toLocaleDateString('en-IN')} · no automatic renewal`) }));
      return null;
    },
    cancelSubscription: (id) => {
      if (!senior || !canManageSenior(me, senior)) return;
      update(d => ({ ...d, care: { ...d.care, subscriptions: d.care.subscriptions.map(s => s.id === id && s.seniorId === senior.id ? { ...s, cancelled: true } : s) }, notices: notifyAll(d, senior.id, 'Exercise subscription cancelled', 'Unused credits removed. Existing bookings stay. No automatic renewal or real charges.') }));
    },
    completeExercise: (planId, day) => {
      if (!senior?.consent?.given || !canManageSenior(me, senior) || !db.care.plans.some(p => p.id === planId && p.days.some(d => d.day === day))) return;
      const date = new Date().toISOString().slice(0, 10);
      update(d => d.care.completions.some(c => c.seniorId === senior.id && c.planId === planId && c.day === day && c.date === date) ? d : ({ ...d, care: { ...d.care, completions: [...d.care.completions, { seniorId: senior.id, planId, date, day }] }, notices: notifyAll(d, senior.id, 'Exercise completed', `${day} · ${new Date().toLocaleString('en-IN')}`) }));
    },
    requestCare: (kind, detail, partnerId) => {
      if (!senior?.consent?.given || !senior.health || !canManageSenior(me, senior)) return 'Complete consent and link a senior first.';
      if (!detail.trim() || detail.length > 2000) return 'Enter a request of up to 2,000 characters.';
      if (kind === 'meal' && !db.kitchens.some(k => k.id === partnerId && k.verified && k.customizes)) return 'Choose a verified kitchen that customizes meals.';
      update(d => ({ ...d, care: { ...d.care, requests: [{ id: uid('req'), seniorId: senior.id, kind, detail: detail.trim(), partnerId, status: 'pending' }, ...d.care.requests] }, notices: notifyAll(d, senior.id, 'Professional review requested', `${kind === 'therapy' ? 'Therapy massage' : 'Meal customization'} · ${new Date().toLocaleString('en-IN')}`) }));
      return null;
    },
    decideCare: (id, approved, professional, decision) => {
      if (me?.role !== 'admin') return 'Only administrators can record a professional decision.';
      if (!professional.trim() || !decision.trim()) return 'Enter the reviewing professional and their decision.';
      const request = db.care.requests.find(r => r.id === id && r.status === 'pending');
      if (!request) return 'This request is no longer awaiting review.';
      update(d => ({ ...d, care: { ...d.care, requests: d.care.requests.map(r => r.id === id ? { ...r, status: approved ? 'approved' : 'rejected', professional: professional.trim(), decision: decision.trim() } : r) }, notices: notifyAll(d, request.seniorId, 'Professional review recorded', `${professional}: ${decision} · demo decision, not clinical approval`) }));
      return null;
    },
    saveDishNutrition: (id, nutrition) => {
      if (me?.role !== 'admin') return 'Only administrators can manage demo menus.';
      if (!validNutrition(nutrition)) return 'Enter positive calories and non-negative carbs and protein.';
      update(d => ({ ...d, dishes: d.dishes.map(dish => dish.id === id ? { ...dish, nutrition } : dish) }));
      return null;
    },
    addReminder: (r) => {
      if (!senior?.consent?.given || !canManageSenior(me, senior)) return 'Complete consent and link a senior first.';
      if (!validReminder(r)) return 'Enter a label (up to 80 characters), a time and at least one day.';
      if (db.care.reminders.filter(x => x.seniorId === senior.id).length >= 30) return 'You can keep up to 30 reminders.';
      const reminder: Reminder = { id: uid('rem'), seniorId: senior.id, kind: r.kind, label: r.label.trim(), time: r.time, days: [...r.days].sort(), active: true, createdBy: me!.id };
      update(d => ({ ...d, care: { ...d.care, reminders: [...d.care.reminders, reminder] }, notices: notifyAll(d, senior.id, 'Reminder added', `${reminder.label} · ${reminder.time} · added by ${me!.name}`) }));
      return null;
    },
    toggleReminder: (id) => {
      if (!senior || !canManageSenior(me, senior)) return;
      update(d => ({ ...d, care: { ...d.care, reminders: d.care.reminders.map(r => r.id === id && r.seniorId === senior.id ? { ...r, active: !r.active } : r) } }));
    },
    deleteReminder: (id) => {
      if (!senior || !canManageSenior(me, senior)) return;
      update(d => ({ ...d, care: { ...d.care, reminders: d.care.reminders.filter(r => !(r.id === id && r.seniorId === senior.id)) } }));
    },
    runTimers: (now = new Date()) => {
      if (!senior?.consent?.given || !canManageSenior(me, senior)) return [];
      const due = dueReminders(db.care.reminders.filter(r => r.seniorId === senior.id), now);
      const soon = bookingsStartingSoon(db.bookings.filter(b => b.seniorId === senior.id), db.care.bookingAlerts, now);
      if (!due.length && !soon.length) return [];
      const titles = [...due.map(r => `Reminder: ${r.label}`), ...soon.map(b => `Starting soon: ${b.title}`)];
      const today = localDate(now);
      update(d => {
        // Recompute from the latest state so overlapping timer ticks never fire twice.
        const dueNow = dueReminders(d.care.reminders.filter(r => r.seniorId === senior.id), now);
        const soonNow = bookingsStartingSoon(d.bookings.filter(b => b.seniorId === senior.id), d.care.bookingAlerts, now);
        if (!dueNow.length && !soonNow.length) return d;
        const dueIds = new Set(dueNow.map(r => r.id));
        let notices = d.notices;
        for (const r of dueNow) notices = notifyAll({ ...d, notices }, senior.id, `Reminder: ${r.label}`, `Scheduled for ${r.time} today`);
        for (const b of soonNow) notices = notifyAll({ ...d, notices }, senior.id, `Starting soon: ${b.title}`, `${b.partnerName} · ${new Date(b.when).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`);
        return { ...d, notices, care: { ...d.care, reminders: d.care.reminders.map(r => dueIds.has(r.id) ? { ...r, lastFired: today } : r), bookingAlerts: [...d.care.bookingAlerts, ...soonNow.map(b => b.id)].slice(-200) } };
      });
      return titles;
    },
    completeCloudRegistration: async (p) => {
      if (!pendingCloud) return "Please verify your email first.";
      if (p.role !== "senior" && p.role !== "family") return "Only Senior or Family accounts can be registered.";
      const username = p.username.trim().toLowerCase();
      const { error } = await supabase.from("profiles").update({ name: p.name.trim(), username, age: p.age ?? null, city: p.city?.trim() || null }).eq("id", pendingCloud.id);
      if (error) return error.code === "23505" ? "That username is taken. Please choose another." : "Could not save your details.";
      const { error: rErr } = await supabase.rpc("choose_role", { _role: p.role });
      if (rErr && !/already set/i.test(rErr.message)) return "Could not save your role.";
      await adoptCloudUser(pendingCloud.id, pendingCloud.email);
      return null;
    },
    login: (id) => {
      const key = id.trim().toLowerCase();
      const u = db.users.find((x) => (x.phone && x.phone === key) || (x.email && x.email.toLowerCase() === key)) ?? null;
      if (u) update((d) => ({ ...d, currentUserId: u.id, activeSeniorId: u.linkedSeniorIds[0] ?? null }));
      return u;
    },
    register: (phone, name, role, extra = {}) => {
      if (role !== "senior" && role !== "family") throw new Error("Only Senior or Family accounts can be registered.");
      const email = extra.email?.trim().toLowerCase() || undefined;
      const existing = db.users.find((u) => (phone && u.phone === phone) || (email && u.email?.toLowerCase() === email));
      if (existing) return existing;
      const username = extra.username?.trim().toLowerCase();
      if (username && db.users.some((u) => u.username === username)) throw new Error("That username is taken. Please choose another.");
      const u: User = { id: uid("u"), phone, name, role, linkedSeniorIds: [], username, email, age: extra.age, city: extra.city?.trim() || undefined };
      update((d) => ({ ...d, users: [...d.users, u], currentUserId: u.id, activeSeniorId: null }));
      return u;
    },
    updateProfile: (p) => {
      if (!me) return "Please sign in again.";
      const username = p.username.trim().toLowerCase();
      const email = p.email?.trim().toLowerCase() || undefined;
      const phone = p.phone?.trim() || "";
      if (p.name.trim().length < 2) return "Please enter your full name.";
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) return "Username: 3–20 letters, numbers, _ or .";
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email.";
      if (phone && !/^\d{10}$/.test(phone)) return "Mobile number must be 10 digits.";
      if (!email && !phone) return "Keep at least a mobile number or an email.";
      if (p.age !== undefined && (p.age < 18 || p.age > 120)) return "Please enter a valid age.";
      const others = db.users.filter((u) => u.id !== me.id);
      if (others.some((u) => u.username === username)) return "That username is taken.";
      if (email && others.some((u) => u.email?.toLowerCase() === email)) return "That email is used by another account.";
      if (phone && others.some((u) => u.phone === phone)) return "That mobile number is used by another account.";
      patchMe((u) => ({ ...u, name: p.name.trim(), username, email, phone, age: p.age, city: p.city?.trim() || undefined }));
      void supabase.auth.getUser().then(({ data }) => { if (data.user?.id === me.id) void supabase.from("profiles").update({ name: p.name.trim(), username, phone: phone || null, age: p.age ?? null, city: p.city?.trim() || null }).eq("id", me.id); });
      return null;
    },
    logout: () => { void supabase.auth.signOut(); setPendingCloud(null); update((d) => ({ ...d, currentUserId: null, activeSeniorId: null })); },
    deleteAccount: () => {
      if (!me) return "Please sign in again.";
      if (me.role === "admin" && db.users.filter((u) => u.role === "admin").length < 2) return "You are the only administrator, so this account cannot be deleted.";
      const id = me.id;
      update((d) => ({ ...d, currentUserId: null, activeSeniorId: null,
        users: d.users.filter((u) => u.id !== id).map((u) => ({ ...u, linkedSeniorIds: u.linkedSeniorIds.filter((x) => x !== id) })),
        bookings: d.bookings.filter((b) => b.seniorId !== id),
        notices: d.notices.filter((n) => n.userId !== id),
        care: { ...d.care, reminders: d.care.reminders.filter((r) => r.seniorId !== id) } }));
      void supabase.auth.signOut(); setPendingCloud(null);
      return null;
    },
    completeOnboarding: (h, address) => patchMe((u) => u.role === "senior" ? { ...u, consent: { given: true, at: new Date().toISOString() }, health: h, address: address.trim() || u.address } : u),
    giveConsent: () => patchMe((u) => u.role === "senior" ? ({ ...u, consent: { given: true, at: new Date().toISOString() } }) : u),
    saveHealth: (h, address) => {
      if (!senior?.consent?.given || !canManageSenior(me, senior)) return;
      update((d) => ({ ...d, users: d.users.map((u) => u.id === senior.id ? { ...u, health: h, address: address ?? u.address } : u) }));
    },
    deleteHealthData: () => {
      if (me?.role !== "senior") return;
      update((d) => ({ ...d, users: d.users.map((u) => u.id === me.id ? { ...u, health: undefined, consent: undefined } : u), bookings: d.bookings.map((b) => b.seniorId === me.id ? { ...b, prescription: undefined, prescriptionData: undefined } : b), care: { ...d.care, requests: d.care.requests.filter(r => r.seniorId !== me.id), completions: d.care.completions.filter(c => c.seniorId !== me.id), reminders: d.care.reminders.filter(r => r.seniorId !== me.id) } }));
    },
    linkSenior: (phone) => {
      if (me?.role !== "family") return "Only family accounts can link a senior.";
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
    setActiveSenior: (id) => { if (me?.role === "family" && me.linkedSeniorIds.includes(id)) update((d) => ({ ...d, activeSeniorId: id })); },
    unlinkFamily: (id) => {
      if (me?.role !== "senior") return;
      update((d) => ({ ...d, users: d.users.map((u) => u.id === id ? { ...u, linkedSeniorIds: u.linkedSeniorIds.filter((sid) => sid !== me.id) } : u) }));
    },
    createBooking: (b) => {
      if (!me || !senior || !canManageSenior(me, senior)) throw new Error("Link a senior before booking.");
      if (!senior.consent?.given || !senior.health) throw new Error("The senior must complete their consent and health profile first.");
      const partners = b.type === "fitness" ? db.coaches : b.type === "meal" ? db.kitchens : db.pharmacies;
      if (!partners.some((p) => p.id === b.partnerId && p.verified)) throw new Error("This partner is not available.");
      if (new Date(b.when) <= new Date()) throw new Error("Please select a future time.");
      if (b.type === "fitness" && db.bookings.some((existing) => existing.type === "fitness" && existing.partnerId === b.partnerId && existing.status !== "cancelled" && existing.when === b.when)) throw new Error("This slot has already been booked.");
      const sid = senior.id;
      const subscription = b.subscriptionId ? db.care.subscriptions.find(s => s.id === b.subscriptionId && s.seniorId === sid && hasActiveSubscription(s) && s.remaining > 0) : undefined;
      if (b.subscriptionId && (!subscription || b.type !== 'fitness' || db.care.plans.find(p => p.id === subscription.planId)?.coachId !== b.partnerId || new Date(b.when) >= new Date(subscription.ends))) throw new Error('No valid subscription credit for this session.');
      const rider = b.type === "fitness" ? null : assignDelivery(db.delivery, db.bookings);
      if (b.type !== "fitness" && !rider) throw new Error("No verified delivery partner is available right now. Please try again later.");
      const booking: Booking = { ...b, id: uid("b"), createdAt: new Date().toISOString(), status: b.type === "medicine" ? "pending_review" : "confirmed", seniorId: sid, bookedBy: me.id, upiRef: "UPI" + Math.floor(1e6 + Math.random() * 9e6), ...(rider ? { deliveryId: rider.id, deliveryName: rider.name } : {}) };
      const who = me.id === sid ? senior.name : `${me.name} (for ${senior.name})`;
      const time = (x: Date) => x.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      const helper = rider ? `Delivery by ${rider.name} (verified) around ${time(new Date(b.when))}` : b.videoUrl ? `${b.partnerName} · online video link in Bookings` : `${b.partnerName} arrives ${time(arrivalWindow(b).from)}–${time(arrivalWindow(b).to)}`;
      const whoRef: Notice["who"] = rider ? { kind: "delivery", id: rider.id, name: rider.name } : { kind: "coach", id: b.partnerId, name: b.partnerName };
      update((d) => ({ ...d, care: { ...d.care, subscriptions: d.care.subscriptions.map(s => s.id === subscription?.id ? { ...s, remaining: s.remaining - 1 } : s) }, bookings: [booking, ...d.bookings], notices: notifyAll(d, sid, `${b.type === "fitness" ? "Session booked" : "Order received"}: ${b.title}`, `${who} · ${b.partnerName} · ${new Date(b.when).toLocaleString("en-IN")} · ${helper} · ${subscription ? 'Subscription credit used' : `₹${b.amount} paid via demo UPI`}`, whoRef) }));
      return booking;
    },
    setStatus: (id, s) => update((d) => {
      const b = d.bookings.find((x) => x.id === id);
      if (!b || !canAccessBooking(me, b) || !canTransition(b, s)) return d;
      const label = { confirmed: "Confirmed", in_progress: "Being prepared", out_for_delivery: "Out for delivery", completed: "Completed", cancelled: "Cancelled", pending_review: "Pharmacy reviewing" }[s];
      return { ...d, care: { ...d.care, subscriptions: d.care.subscriptions.map(sub => s === 'cancelled' && b.subscriptionId === sub.id && hasActiveSubscription(sub) ? { ...sub, remaining: Math.min(EXERCISE_SUBSCRIPTION.sessions, sub.remaining + 1) } : sub) }, bookings: d.bookings.map((x) => (x.id === id ? { ...x, status: s } : x)), notices: notifyAll(d, b.seniorId, `${b.title}: ${label}`, b.deliveryName && ["out_for_delivery", "completed"].includes(s) ? `${b.deliveryName} · delivering from ${b.partnerName}` : `Update from ${b.partnerName}`, b.deliveryId && b.deliveryName ? { kind: "delivery", id: b.deliveryId, name: b.deliveryName } : b.type === "fitness" ? { kind: "coach", id: b.partnerId, name: b.partnerName } : undefined) };
    }),
    review: (id, rating, text) => update((d) => ({ ...d, bookings: d.bookings.map((x) => (x.id === id && x.status === "completed" && !x.review && me?.role !== "admin" && canAccessBooking(me, x) && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { ...x, review: { rating, text: text.trim() } } : x)) })),
    markRead: () => update((d) => ({ ...d, notices: d.notices.map((n) => (n.userId === d.currentUserId ? { ...n, read: true } : n)) })),
    toggleVerify: (kind, id) => {
      if (me?.role !== "admin") return;
      update((d) => {
        const next = { ...d, [kind]: (d[kind] as { id: string; verified: boolean }[]).map((x) => (x.id === id ? { ...x, verified: !x.verified } : x)) } as DB;
        if (kind !== "delivery" || next.delivery.find((x) => x.id === id)?.verified) return next;
        // An unverified rider is taken off every open order; each order moves to a verified rider if one exists.
        let bookings = next.bookings;
        for (const b of bookings.filter((x) => x.deliveryId === id && !["completed", "cancelled"].includes(x.status))) {
          const rider = assignDelivery(next.delivery, bookings);
          bookings = bookings.map((x) => (x.id === b.id ? { ...x, deliveryId: rider?.id, deliveryName: rider?.name } : x));
        }
        return { ...next, bookings };
      });
    },
    setPartnerPhoto: (kind, id, photo) => {
      if (me?.role !== "admin") return "Only administrators can change partner photos.";
      if (photo !== undefined && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 60000)) return "Use a JPG, PNG or WebP photo (it is resized automatically).";
      const key = ({ coach: "coaches", kitchen: "kitchens", pharmacy: "pharmacies", delivery: "delivery" } as const)[kind];
      update((d) => ({ ...d, [key]: (d[key] as { id: string; photo?: string }[]).map((x) => (x.id === id ? { ...x, photo } : x)) }) as DB);
      return null;
    },
    toggleDishTag: (dishId, tag) => { if (me?.role === "admin") update((d) => ({ ...d, dishes: d.dishes.map((x) => (x.id === dishId ? { ...x, tags: x.tags.includes(tag) ? x.tags.filter((t) => t !== tag) : [...x.tags, tag] } : x)) })); },
    resetDemo: () => { if (me?.role === "admin") setDb({ ...fresh(), updatedAt: Date.now() }); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, ready, me, senior, pendingCloud, adoptCloudUser, sync]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
