// Server-only: creates the shared demo data in Lovable Cloud once (partners, dishes, demo accounts, sample bookings).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { seedBookings, seedCoaches, seedDelivery, seedDishes, seedKitchens, seedNotices, seedPharmacies, seedTherapists, seedUsers } from "./seed";
import { freshCare } from "./care";
import { phoneEmail } from "./cloud";

type Admin = SupabaseClient<Database>;
const DEMO_USERNAMES: Record<string, string> = { "u-senior-1": "demo_kamala", "u-senior-2": "demo_harbhajan", "u-family-1": "demo_arjun", "u-admin-1": "demo_admin" };

async function userIdForPhone(admin: Admin, phone: string): Promise<string> {
  const { data: found } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email: phoneEmail(phone), email_confirm: true, user_metadata: { phone } });
  if (error || !data.user) throw new Error(`Could not create demo account ${phone}`);
  return data.user.id;
}

export async function ensureDemoData(admin: Admin): Promise<void> {
  const { data: marker } = await admin.from("catalog").select("id").eq("kind", "meta").eq("id", "demo_seeded").maybeSingle();
  if (marker) return;

  // Partner catalogue
  const rows = [
    ...seedCoaches.map((x, i) => ({ kind: "coach", id: x.id, ord: i, data: x })),
    ...seedKitchens.map((x, i) => ({ kind: "kitchen", id: x.id, ord: i, data: x })),
    ...seedDishes.map((x, i) => ({ kind: "dish", id: x.id, ord: i, data: x })),
    ...seedPharmacies.map((x, i) => ({ kind: "pharmacy", id: x.id, ord: i, data: x })),
    ...seedTherapists.map((x, i) => ({ kind: "therapist", id: x.id, ord: i, data: x })),
    ...seedDelivery.map((x, i) => ({ kind: "delivery", id: x.id, ord: i, data: x })),
    ...freshCare().plans.map((x, i) => ({ kind: "plan", id: x.id, ord: i, data: x })),
  ].map((r) => ({ ...r, data: r.data as unknown as Json }));
  const { error: catErr } = await admin.from("catalog").upsert(rows, { onConflict: "kind,id", ignoreDuplicates: true });
  if (catErr) throw new Error("Could not load the partner catalogue");

  // Demo accounts (all invented people)
  const ids: Record<string, string> = {};
  for (const u of seedUsers) {
    const id = await userIdForPhone(admin, u.phone);
    ids[u.id] = id;
    await admin.from("profiles").update({
      name: u.name, phone: u.phone, username: DEMO_USERNAMES[u.id] ?? null, address: u.address ?? null,
      consent_at: u.consent?.at ?? null, health: (u.health ?? null) as unknown as Json,
      // pincode/state: migration 0003 columns, not yet in the generated types
      ...({ pincode: u.pincode ?? null, state: u.state ?? null, city: u.city ?? null } as object),
    }).eq("id", id);
    await admin.from("user_roles").upsert({ user_id: id, role: u.role as "senior" | "family" | "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  }
  for (const u of seedUsers) for (const s of u.linkedSeniorIds) {
    await admin.from("family_links").upsert({ family_id: ids[u.id], senior_id: ids[s] }, { onConflict: "family_id,senior_id", ignoreDuplicates: true });
  }

  // Sample bookings and alerts
  const bookings = seedBookings.map((b) => {
    const data = { ...b, seniorId: ids[b.seniorId], bookedBy: ids[b.bookedBy] };
    return { id: b.id, senior_id: data.seniorId, booked_by: data.bookedBy, data: data as unknown as Json };
  });
  await admin.from("bookings").upsert(bookings, { onConflict: "id", ignoreDuplicates: true });
  const seniorOf = (seedId: string) => seedUsers.find((u) => u.id === seedId)?.role === "senior" ? seedId : seedUsers.find((u) => u.id === seedId)?.linkedSeniorIds[0];
  const notices = seedNotices.map((n) => {
    const { id, userId, ...rest } = n;
    const senior = seniorOf(userId);
    return { id, user_id: ids[userId], senior_id: senior ? ids[senior] : null, data: rest as unknown as Json };
  });
  await admin.from("notices").upsert(notices, { onConflict: "id", ignoreDuplicates: true });

  await admin.from("catalog").upsert({ kind: "meta", id: "demo_seeded", ord: 0, data: { at: new Date().toISOString() } });
}
