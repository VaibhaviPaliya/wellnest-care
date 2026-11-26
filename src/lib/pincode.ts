/**
 * Indian postal addresses: pincode checks, state from the pincode's first digits, and partner service areas.
 * Browser-safe (no network). The city lookup runs on the server in pincode.functions.ts.
 */
export interface Address { line: string; pincode: string; city: string; state: string; }
export const EMPTY_ADDRESS: Address = { line: "", pincode: "", city: "", state: "" };

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;

/** A valid Indian pincode: six digits, not starting with 0. (9xxxxx is the Army Postal Service.) */
export const isPincode = (v: string) => /^[1-8]\d{5}$/.test(v.trim());

// India Post postal circles. Three-digit exceptions are checked before the two-digit ranges.
const THREE: [number, number, string][] = [
  [160, 160, "Chandigarh"], [194, 194, "Ladakh"], [246, 249, "Uttarakhand"], [263, 263, "Uttarakhand"],
  [403, 403, "Goa"], [490, 497, "Chhattisgarh"], [605, 605, "Puducherry"], [682, 682, "Kerala"],
  [737, 737, "Sikkim"], [744, 744, "Andaman and Nicobar Islands"],
  [790, 792, "Arunachal Pradesh"], [793, 794, "Meghalaya"], [795, 795, "Manipur"], [796, 796, "Mizoram"],
  [797, 798, "Nagaland"], [799, 799, "Tripura"], [814, 816, "Jharkhand"], [825, 835, "Jharkhand"],
];
const TWO: [number, number, string][] = [
  [11, 11, "Delhi"], [12, 13, "Haryana"], [14, 16, "Punjab"], [17, 17, "Himachal Pradesh"], [18, 19, "Jammu and Kashmir"],
  [20, 28, "Uttar Pradesh"], [30, 34, "Rajasthan"], [36, 39, "Gujarat"], [40, 44, "Maharashtra"], [45, 48, "Madhya Pradesh"],
  [50, 50, "Telangana"], [51, 53, "Andhra Pradesh"], [56, 59, "Karnataka"], [60, 64, "Tamil Nadu"], [67, 69, "Kerala"],
  [70, 74, "West Bengal"], [75, 77, "Odisha"], [78, 78, "Assam"], [80, 85, "Bihar"],
];
/** Best guess of the state from the pincode alone. India Post's lookup (or the user) can correct it. */
export function stateFromPincode(pin: string): string | null {
  if (!isPincode(pin)) return null;
  const p3 = Number(pin.slice(0, 3)), p2 = Number(pin.slice(0, 2));
  return THREE.find(([a, b]) => p3 >= a && p3 <= b)?.[2] ?? TWO.find(([a, b]) => p2 >= a && p2 <= b)?.[2] ?? null;
}

/** Problems with an address, or null when it is complete. */
export function addressProblem(a: Partial<Address> | undefined): string | null {
  if (!a?.line?.trim()) return "Enter the house / street address.";
  if (!isPincode(a.pincode ?? "")) return "Enter a valid 6-digit Indian pincode.";
  if (!a.city?.trim()) return "Enter the city.";
  if (!a.state || !(INDIAN_STATES as readonly string[]).includes(a.state)) return "Choose the state.";
  return null;
}

/** Splits typed or pasted pincodes ("560011, 560041 560069") into unique valid ones and the rejects. */
export function parsePincodes(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const valid = [...new Set(parts.filter(isPincode))];
  return { valid, invalid: parts.filter((x) => !isPincode(x)) };
}

/** Partners list the pincodes they deliver to or visit. */
export const servesPincode = (p: { servicePincodes?: string[] }, pin: string | undefined) =>
  !!pin && !!p.servicePincodes?.includes(pin);

/** Modes a coach can offer this customer: online always; home visits only inside their service area. */
export function coachModesFor<T extends { mode: ("home" | "online")[]; servicePincodes?: string[] }>(c: T, pin: string | undefined) {
  return c.mode.filter((m) => m === "online" || servesPincode(c, pin));
}

export const formatAddress = (a: Partial<Address>) =>
  [a.line, a.city, a.state && a.pincode ? `${a.state} ${a.pincode}` : a.state || a.pincode].filter(Boolean).join(", ");

const STATE_ALIASES: Record<string, string> = {
  chattisgarh: "Chhattisgarh", orissa: "Odisha", pondicherry: "Puducherry", uttaranchal: "Uttarakhand",
  newdelhi: "Delhi", nctofdelhi: "Delhi", andamanandnicobar: "Andaman and Nicobar Islands",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu", damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
};
const squash = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
/** Maps India Post's state spelling ("Andaman & Nicobar Islands", "Chattisgarh") onto the form's list. */
export function normalizeState(s: string | undefined): string | null {
  if (!s) return null;
  const k = squash(s);
  return INDIAN_STATES.find((x) => squash(x) === k) ?? STATE_ALIASES[k] ?? null;
}

/** A person's stored address fields as one Address (the street line is kept in `address`). */
export const addressOf = (u: { address?: string; pincode?: string; city?: string; state?: string } | null | undefined): Address =>
  ({ line: u?.address ?? "", pincode: u?.pincode ?? "", city: u?.city ?? "", state: u?.state ?? "" });
