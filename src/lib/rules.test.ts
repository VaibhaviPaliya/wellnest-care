import { describe, it, expect } from "vitest";
import { isSuitable } from "./rules";
import { seedDishes } from "./seed";

const byId = (id: string) => seedDishes.find((d) => d.id === id)!;

describe("dish suitability", () => {
  it("diabetic senior never sees a dish without low-sugar tag", () => {
    expect(isSuitable(byId("d9"), { conditions: ["diabetes"], diet: "veg", mobility: "independent", allergies: "" })).toBe(false);
  });
  it("diabetes + high BP requires both low sugar and low sodium", () => {
    const h = { conditions: ["diabetes", "high_bp"] as const, diet: "veg" as const, mobility: "assisted" as const, allergies: "" };
    expect(isSuitable(byId("d1"), { ...h, conditions: [...h.conditions] })).toBe(false);
    expect(isSuitable(byId("d16"), { ...h, conditions: [...h.conditions] })).toBe(true);
  });
  it("vegetarian senior is never shown non-veg dishes", () => {
    expect(isSuitable(byId("d14"), { conditions: [], diet: "veg", mobility: "independent", allergies: "" })).toBe(false);
  });
});
