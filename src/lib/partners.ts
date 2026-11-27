/**
 * Partner self-registration rules shared by the store, the partner dashboard and the admin page.
 * The Cloud database enforces the same rules in submit_partner (migration 0003).
 */
import { addressProblem, isPincode, servesPincode, coachModesFor, type Address } from "./pincode";
import type { Coach, Dish, Kitchen, Pharmacy, PartnerType, Therapist, TherapyService } from "./seed";

export type Listing = Coach | Kitchen | Pharmacy | Therapist;
export const PARTNER_KEY = { pharmacy: "pharmacies", kitchen: "kitchens", coach: "coaches", therapist: "therapists" } as const;
export const PARTNER_LABEL: Record<PartnerType, string> = { pharmacy: "Medical store / pharmacy", kitchen: "Kitchen", coach: "Fitness coach", therapist: "Massage therapist" };
export const LICENCE_LABEL: Record<PartnerType, string> = {
  pharmacy: "Drug licence number", kitchen: "FSSAI licence / registration number", coach: "Certification or registration number",
  therapist: "Therapy licence / certification number",
};

/** What a partner fills in. Status, verification and ownership are never taken from the form. */
export interface PartnerApplication {
  name: string;
  licence: string;
  contactPhone: string;
  address: Address;
  servicePincodes: string[];
  // pharmacy
  eta?: string;
  // kitchen
  kitchenKind?: "dabba" | "restaurant";
  customizes?: boolean;
  // coach
  types?: Coach["types"];
  mode?: Coach["mode"];
  level?: Coach["level"];
  price?: number;
  slots?: string[];
  bio?: string;
  years?: number;
  // therapist
  services?: TherapyService[];
  gender?: "female" | "male";
}

export function applicationProblem(kind: PartnerType, a: PartnerApplication): string | null {
  if (!a.name.trim() || a.name.trim().length > 120) return "Enter the business or coach name.";
  if (!a.licence.trim() || a.licence.length > 80) return `Enter the ${LICENCE_LABEL[kind].toLowerCase()}.`;
  if (!/^[6-9]\d{9}$/.test(a.contactPhone.trim())) return "Enter a 10-digit Indian mobile number.";
  const addr = addressProblem(a.address);
  if (addr) return addr;
  if (!a.servicePincodes.length) return "Add at least one pincode you serve.";
  if (a.servicePincodes.length > 50) return "List up to 50 service pincodes.";
  if (a.servicePincodes.some((p) => !isPincode(p))) return "Remove the invalid service pincodes.";
  if (kind === "therapist") {
    if (!a.services?.length || a.services.length > 6) return "Add between 1 and 6 services.";
    for (const s of a.services) {
      if (!s.name.trim() || s.name.length > 60) return "Give each service a name.";
      if (!Number.isInteger(s.minutes) || s.minutes < 15 || s.minutes > 120) return "Service length must be 15–120 minutes.";
      if (!Number.isInteger(s.price) || s.price < 1 || s.price > 100000) return "Service price must be ₹1–₹1,00,000.";
    }
    if (!a.slots?.length || a.slots.some((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))) return "Add at least one time slot (HH:MM).";
  }
  if (kind === "coach") {
    if (!a.types?.length) return "Choose at least one class type.";
    if (!a.mode?.length) return "Choose home visits, online classes, or both.";
    if (!a.price || a.price < 1 || a.price > 100000) return "Enter a session price between ₹1 and ₹1,00,000.";
    if (!a.slots?.length || a.slots.some((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))) return "Add at least one time slot (HH:MM).";
  }
  return null;
}

/** The catalogue fields a submission produces (before the server adds id, owner and pending status). */
export function listingFields(kind: PartnerType, a: PartnerApplication): Record<string, unknown> {
  const common = {
    name: a.name.trim(), licence: a.licence.trim(), contactPhone: a.contactPhone.trim(),
    address: { ...a.address, line: a.address.line.trim(), city: a.address.city.trim() },
    servicePincodes: [...new Set(a.servicePincodes)], area: a.address.city.trim(),
  };
  if (kind === "pharmacy") return { ...common, eta: a.eta?.trim() || "60 min" };
  if (kind === "kitchen") return { ...common, kind: a.kitchenKind ?? "dabba", customizes: !!a.customizes };
  if (kind === "therapist") return {
    ...common, gender: a.gender, slots: [...new Set(a.slots)].sort(), bio: (a.bio ?? "").trim().slice(0, 300), years: Math.max(0, Math.min(60, Math.round(a.years ?? 0))),
    services: (a.services ?? []).map((s, i) => ({ id: /^sv-[a-z0-9-]{3,40}$/.test(s.id) ? s.id : `sv-${i + 1}-${Math.random().toString(36).slice(2, 8)}`, name: s.name.trim(), minutes: s.minutes, price: s.price })),
  };
  return {
    ...common, types: a.types, mode: a.mode, level: a.level ?? "gentle", price: Math.round(a.price ?? 0),
    slots: [...new Set(a.slots)].sort(), bio: (a.bio ?? "").trim().slice(0, 300), years: Math.max(0, Math.min(60, Math.round(a.years ?? 0))),
  };
}

/** The signed-in partner's listing, if they have submitted one. */
export function findMyListing(db: { coaches: Coach[]; kitchens: Kitchen[]; pharmacies: Pharmacy[]; therapists?: Therapist[] }, userId: string | undefined): { kind: PartnerType; listing: Listing } | null {
  if (!userId) return null;
  for (const kind of ["pharmacy", "kitchen", "coach", "therapist"] as const) {
    const listing = ((db[PARTNER_KEY[kind]] ?? []) as Listing[]).find((x) => x.ownerId === userId);
    if (listing) return { kind, listing };
  }
  return null;
}

export const listingStatus = (l: Listing): "pending" | "approved" | "rejected" | "suspended" =>
  l.verified ? "approved" : l.status === "rejected" ? "rejected" : l.status === "approved" ? "suspended" : l.ownerId ? "pending" : "suspended";

/** Partners shown to a customer: approved, and serving the senior's pincode (coaches: or teaching online). */
export function partnersFor<T extends Listing>(list: T[], kind: PartnerType, pincode: string | undefined): T[] {
  return list.filter((p) => p.verified && (kind === "coach" ? coachModesFor(p as Coach, pincode).length > 0 : servesPincode(p, pincode)));
}

export function dishProblem(d: Pick<Dish, "name" | "price" | "diet" | "desc">): string | null {
  if (!d.name.trim() || d.name.length > 120) return "Enter a dish name.";
  if (!Number.isFinite(d.price) || d.price < 1 || d.price > 10000) return "Enter a price between ₹1 and ₹10,000.";
  if (!["veg", "non_veg", "egg"].includes(d.diet)) return "Choose veg, egg or non-veg.";
  if ((d.desc ?? "").length > 300) return "Keep the description under 300 characters.";
  return null;
}
