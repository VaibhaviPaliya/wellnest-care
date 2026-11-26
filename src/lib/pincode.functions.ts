import { createServerFn } from "@tanstack/react-start";
import { isPincode } from "./pincode";

/**
 * Looks up a pincode in India Post's public directory (api.postalpincode.in).
 * Runs on the server so the browser never depends on that site's cross-origin settings.
 * Returns null when the pincode is unknown or the service is unreachable; the form then stays editable.
 */
export const lookupPincode = createServerFn({ method: "GET" })
  .validator((input: { pincode: string }) => {
    const pincode = String(input?.pincode ?? "").trim();
    if (!isPincode(pincode)) throw new Error("Enter a valid 6-digit Indian pincode.");
    return { pincode };
  })
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${data.pincode}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { Status?: string; PostOffice?: { Name?: string; District?: string; State?: string }[] | null }[];
      const offices = body?.[0]?.Status === "Success" ? body[0].PostOffice ?? [] : [];
      const first = offices.find((o) => o.District && o.State);
      if (!first) return null;
      return {
        city: String(first.District),
        state: String(first.State),
        localities: [...new Set(offices.map((o) => o.Name).filter((n): n is string => !!n))].slice(0, 12),
      };
    } catch {
      return null;
    }
  });
