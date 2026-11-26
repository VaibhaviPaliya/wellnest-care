import { describe, expect, it } from "vitest";
import { addressProblem, coachModesFor, isPincode, normalizeState, parsePincodes, servesPincode, stateFromPincode } from "./pincode";

describe("Indian pincodes", () => {
  it("accepts 6-digit pincodes that don't start with 0 or 9", () => {
    expect(isPincode("560011")).toBe(true);
    expect(isPincode("110001")).toBe(true);
    for (const bad of ["056001", "960011", "56001", "5600111", "56001a", ""]) expect(isPincode(bad)).toBe(false);
  });
  it("guesses the state from the pincode's first digits, including the special circles", () => {
    expect(stateFromPincode("560011")).toBe("Karnataka");
    expect(stateFromPincode("110001")).toBe("Delhi");
    expect(stateFromPincode("400001")).toBe("Maharashtra");
    expect(stateFromPincode("600001")).toBe("Tamil Nadu");
    expect(stateFromPincode("500001")).toBe("Telangana");
    expect(stateFromPincode("160022")).toBe("Chandigarh");
    expect(stateFromPincode("403001")).toBe("Goa");
    expect(stateFromPincode("248001")).toBe("Uttarakhand");
    expect(stateFromPincode("492001")).toBe("Chhattisgarh");
    expect(stateFromPincode("834001")).toBe("Jharkhand");
    expect(stateFromPincode("793001")).toBe("Meghalaya");
    expect(stateFromPincode("12345")).toBeNull();
  });
  it("maps India Post spellings onto the form's state list", () => {
    expect(normalizeState("Andaman & Nicobar Islands")).toBe("Andaman and Nicobar Islands");
    expect(normalizeState("Chattisgarh")).toBe("Chhattisgarh");
    expect(normalizeState("KARNATAKA")).toBe("Karnataka");
    expect(normalizeState("Atlantis")).toBeNull();
  });
  it("needs street, valid pincode, city and a listed state", () => {
    const ok = { line: "12, 4th Cross", pincode: "560011", city: "Bengaluru", state: "Karnataka" };
    expect(addressProblem(ok)).toBeNull();
    expect(addressProblem({ ...ok, line: " " })).toMatch(/street/);
    expect(addressProblem({ ...ok, pincode: "56001" })).toMatch(/pincode/);
    expect(addressProblem({ ...ok, city: "" })).toMatch(/city/);
    expect(addressProblem({ ...ok, state: "Bavaria" })).toMatch(/state/);
  });
  it("splits pasted service pincodes and reports the bad ones", () => {
    expect(parsePincodes("560011, 560041 560011;012345")).toEqual({ valid: ["560011", "560041"], invalid: ["012345"] });
  });
  it("filters partners by service pincode; online coaching works anywhere", () => {
    const store = { servicePincodes: ["560011", "560041"] };
    expect(servesPincode(store, "560011")).toBe(true);
    expect(servesPincode(store, "160022")).toBe(false);
    expect(servesPincode(store, undefined)).toBe(false);
    const coach = { mode: ["home", "online"] as ("home" | "online")[], servicePincodes: ["560011"] };
    expect(coachModesFor(coach, "560011")).toEqual(["home", "online"]);
    expect(coachModesFor(coach, "160022")).toEqual(["online"]);
    expect(coachModesFor({ ...coach, mode: ["home"] }, "160022")).toEqual([]);
  });
});
