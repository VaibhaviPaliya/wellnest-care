import { describe, expect, it } from "vitest";
import { aadhaarFileProblem, distanceKm, etaMinutes, fresh, navigateUrl, offerSecondsLeft, riderStatus } from "./riders";
import { publicRider } from "./cloud";

describe("delivery helpers", () => {
  it("measures straight-line distance", () => {
    // Jayanagar → Koramangala is roughly 4–5 km
    const d = distanceKm({ lat: 12.925, lng: 77.5938 }, { lat: 12.9352, lng: 77.6245 });
    expect(d).toBeGreaterThan(3); expect(d).toBeLessThan(4.5);
    expect(distanceKm({ lat: 12.9, lng: 77.6 }, { lat: 12.9, lng: 77.6 })).toBe(0);
  });
  it("estimates arrival in city traffic, never below a minute", () => {
    expect(etaMinutes(0)).toBe(1);
    expect(etaMinutes(3)).toBe(13); // 3 km × 1.3 ÷ 18 km/h ≈ 13 min
  });
  it("counts down a 60-second offer", () => {
    const now = Date.parse("2026-11-26T10:00:30Z");
    expect(offerSecondsLeft({ riderId: "r", offeredAt: "2026-11-26T10:00:00Z" }, now)).toBe(30);
    expect(offerSecondsLeft({ riderId: "r", offeredAt: "2026-11-26T09:58:00Z" }, now)).toBe(0);
    expect(offerSecondsLeft(undefined, now)).toBe(0);
  });
  it("treats a location older than 90 s as stale", () => {
    const now = Date.parse("2026-11-26T10:02:00Z");
    expect(fresh("2026-11-26T10:01:00Z", now)).toBe(true);
    expect(fresh("2026-11-26T10:00:00Z", now)).toBe(false);
    expect(fresh(null, now)).toBe(false);
  });
  it("walks a rider through registration → document → verification", () => {
    const base = { id: "dl-1", name: "Ravi", vehicle: "Motorbike", area: "", verified: false, ownerPartnerId: "ph-1" };
    expect(riderStatus(base)).toBe("needs_account");
    expect(riderStatus({ ...base, riderUserId: "u" })).toBe("needs_document");
    expect(riderStatus({ ...base, riderUserId: "u", docUploadedAt: "x" })).toBe("pending");
    expect(riderStatus({ ...base, riderUserId: "u", docUploadedAt: "x", status: "rejected" })).toBe("rejected");
    expect(riderStatus({ ...base, verified: true })).toBe("verified");
  });
  it("only accepts small image or PDF Aadhaar files", () => {
    expect(aadhaarFileProblem({ type: "image/png", size: 200_000 })).toBeNull();
    expect(aadhaarFileProblem({ type: "application/pdf", size: 900_000 })).toBeNull();
    expect(aadhaarFileProblem({ type: "text/html", size: 10 })).toMatch(/JPG/);
    expect(aadhaarFileProblem({ type: "image/jpeg", size: 2_000_000 })).toMatch(/1 MB/);
  });
  it("navigates to the home pin when there is one, else to the address", () => {
    const j = { address: "12, 4th Cross", city: "Bengaluru", state: "Karnataka", pincode: "560011", home_lat: null, home_lng: null };
    expect(navigateUrl(j)).toContain(encodeURIComponent("12, 4th Cross, Bengaluru, Karnataka, 560011"));
    expect(navigateUrl({ ...j, home_lat: 12.93, home_lng: 77.58 })).toContain(encodeURIComponent("12.93,77.58"));
  });
  it("never writes a rider's phone or identity fields to the shared catalogue", () => {
    const pub = publicRider({ id: "dl-1", name: "Ravi", vehicle: "Motorbike", area: "", verified: true, phone: "9000000301", riderUserId: "u", aadhaarName: "Ravi Kumar", docUploadedAt: "x" });
    expect(pub).not.toHaveProperty("phone");
    expect(pub).not.toHaveProperty("aadhaarName");
    expect(pub).not.toHaveProperty("riderUserId");
    expect(pub).toMatchObject({ id: "dl-1", name: "Ravi", verified: true });
  });
});
