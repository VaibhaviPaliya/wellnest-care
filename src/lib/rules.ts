import type { Condition, DietTag, Dish, HealthProfile } from "./seed";

/** Each chronic condition requires the dish to carry this tag. */
export const CONDITION_RULES: Record<Condition, { tag: DietTag; reason: string }> = {
  diabetes: { tag: "low_sugar", reason: "Low sugar — helps keep blood sugar steady" },
  high_bp: { tag: "low_sodium", reason: "Low sodium — kind to your blood pressure" },
  heart: { tag: "low_oil", reason: "Low oil — better for your heart" },
  chewing: { tag: "soft_food", reason: "Soft texture — easy to chew and swallow" },
};

export function matchesDiet(dish: Dish, h: HealthProfile): boolean {
  if (h.diet === "veg") return dish.diet === "veg";
  if (h.diet === "jain") return dish.diet === "veg" && dish.jain;
  if (h.diet === "eggetarian") return dish.diet !== "non_veg";
  return true;
}

/** Strict filter: dish must satisfy every condition rule and the diet preference. */
export function isSuitable(dish: Dish, h: HealthProfile): boolean {
  return matchesDiet(dish, h) && h.conditions.every((c) => dish.tags.includes(CONDITION_RULES[c].tag));
}

export function whyItSuits(dish: Dish, h: HealthProfile): string[] {
  const r = h.conditions.map((c) => CONDITION_RULES[c].reason);
  if (dish.tags.includes("high_fiber")) r.push("High fibre — good for digestion");
  if (dish.tags.includes("high_protein")) r.push("Protein-rich — supports muscle strength");
  if (r.length === 0) r.push("Balanced, home-style meal");
  return r;
}
