import { describe, expect, it } from "vitest";
import { applicationProblem, findMyListing, listingFields, listingStatus, partnersFor, type PartnerApplication } from "./partners";
import { seedCoaches, seedKitchens, seedPharmacies } from "./seed";

const app: PartnerApplication = {
  name: "Sri Sai Medicals", licence: "KA-B-12345", contactPhone: "9876543211",
  address: { line: "4th Block", pincode: "560011", city: "Bengaluru", state: "Karnataka" }, servicePincodes: ["560011"],
};

describe("partner applications", () => {
  it("requires licence, mobile, full address and service pincodes", () => {
    expect(applicationProblem("pharmacy", app)).toBeNull();
    expect(applicationProblem("pharmacy", { ...app, licence: "" })).toMatch(/drug licence/i);
    expect(applicationProblem("pharmacy", { ...app, contactPhone: "12345" })).toMatch(/mobile/);
    expect(applicationProblem("pharmacy", { ...app, address: { ...app.address, pincode: "0" } })).toMatch(/pincode/);
    expect(applicationProblem("pharmacy", { ...app, servicePincodes: [] })).toMatch(/at least one pincode/);
  });
  it("checks coach-specific details", () => {
    const coach = { ...app, types: ["yoga" as const], mode: ["home" as const], price: 499, slots: ["07:00"] };
    expect(applicationProblem("coach", coach)).toBeNull();
    expect(applicationProblem("coach", { ...coach, types: [] })).toMatch(/class type/);
    expect(applicationProblem("coach", { ...coach, slots: ["7am"] })).toMatch(/time slot/);
  });
  it("never lets the form set verification or ownership", () => {
    const f = listingFields("pharmacy", { ...app, ...({ verified: true, ownerId: "x" } as object) } as PartnerApplication);
    expect(f).not.toHaveProperty("verified");
    expect(f).not.toHaveProperty("ownerId");
    expect(f['servicePincodes']).toEqual(["560011"]);
  });
  it("finds the partner's own listing and its status", () => {
    const mine = { ...seedPharmacies[0], id: "ph-1", ownerId: "u-p", verified: false, status: "pending" as const };
    const found = findMyListing({ coaches: seedCoaches, kitchens: seedKitchens, pharmacies: [...seedPharmacies, mine] }, "u-p");
    expect(found?.kind).toBe("pharmacy");
    expect(listingStatus(found!.listing)).toBe("pending");
    expect(listingStatus({ ...mine, status: "rejected" })).toBe("rejected");
    expect(listingStatus({ ...mine, verified: true, status: "approved" })).toBe("approved");
  });
  it("shows customers only verified partners serving their pincode", () => {
    expect(partnersFor(seedPharmacies, "pharmacy", "560011").map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(partnersFor(seedPharmacies, "pharmacy", "160022").map((p) => p.id)).toEqual(["p5"]);
    expect(partnersFor(seedPharmacies, "pharmacy", undefined)).toEqual([]);
    expect(partnersFor(seedKitchens, "kitchen", "560011").map((k) => k.id)).toEqual(["k1", "k3"]);
    // Chandigarh: no home-visit coaches, but online-only and hybrid coaches still teach online
    expect(partnersFor(seedCoaches, "coach", "160022").map((c) => c.id)).toEqual(["c1", "c3", "c4"]);
  });
});
