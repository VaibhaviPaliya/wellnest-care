import { describe, expect, it } from "vitest";
import { cheapestService, needsDoctorApproval } from "./therapy";
import { applicationProblem, listingFields } from "./partners";
import { seedTherapists, type HealthProfile } from "./seed";

const h = (conditions: HealthProfile["conditions"], mobility: HealthProfile["mobility"] = "independent") => ({ conditions, mobility }) as HealthProfile;

describe("therapy safety", () => {
  it("asks for a doctor's OK for heart, high BP or limited mobility", () => {
    expect(needsDoctorApproval(h(["heart"]))).toBe(true);
    expect(needsDoctorApproval(h(["high_bp"]))).toBe(true);
    expect(needsDoctorApproval(h([], "limited"))).toBe(true);
    expect(needsDoctorApproval(h(["diabetes"]))).toBe(false);
    expect(needsDoctorApproval(undefined)).toBe(false);
  });
  it("finds the cheapest service", () => {
    expect(cheapestService({ ...seedTherapists[0], services: [{ id: "a", name: "A", minutes: 60, price: 900 }, { id: "b", name: "B", minutes: 30, price: 450 }] })).toBe(450);
  });
});

describe("therapist applications", () => {
  const base = { name: "Lakshmi", licence: "AYU-1", contactPhone: "9876543210", address: { line: "1 Road", city: "Bengaluru", state: "Karnataka", pincode: "560011" }, servicePincodes: ["560011"], slots: ["10:00"], services: [{ id: "sv-1", name: "Full body", minutes: 60, price: 900 }] } as unknown as Parameters<typeof applicationProblem>[1];
  it("needs 1–6 valid services", () => {
    expect(applicationProblem("therapist", { ...base, services: [] })).toMatch(/service/i);
    expect(applicationProblem("therapist", { ...base, services: [{ id: "sv-1", name: "x", minutes: 5, price: 100 }] })).toBeTruthy();
    expect(applicationProblem("therapist", { ...base, services: [{ id: "sv-1", name: "x", minutes: 30, price: 0 }] })).toBeTruthy();
  });
  it("gives new services a server-friendly id", () => {
    const f = listingFields("therapist", { ...base, services: [{ id: "bad id", name: " Foot ", minutes: 30, price: 500 }] }) as { services: { id: string; name: string }[] };
    expect(f.services[0].id).toMatch(/^sv-/);
    expect(f.services[0].name).toBe("Foot");
  });
});
