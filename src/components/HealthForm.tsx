import { useState } from "react";
import { CONDITION_LABEL, DIET_LABEL, MOBILITY_LABEL, type Condition, type DietPref, type HealthProfile, type Mobility } from "@/lib/seed";

export function HealthForm({ initial, initialAddress, submitLabel, onSubmit }: { initial?: HealthProfile; initialAddress?: string; submitLabel: string; onSubmit: (h: HealthProfile, address: string) => void }) {
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [diet, setDiet] = useState<DietPref>(initial?.diet ?? "veg");
  const [mobility, setMobility] = useState<Mobility>(initial?.mobility ?? "independent");
  const [allergies, setAllergies] = useState(initial?.allergies ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const toggle = (c: Condition) => setConditions((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  return (
    <div className="mt-6 space-y-6">
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Health conditions (choose all that apply)</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
            <button type="button" key={c} className="chip" aria-pressed={conditions.includes(c)} onClick={() => toggle(c)}>{CONDITION_LABEL[c]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Food preference</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIET_LABEL) as DietPref[]).map((d) => (
            <button type="button" key={d} className="chip" aria-pressed={diet === d} onClick={() => setDiet(d)}>{DIET_LABEL[d]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Mobility</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOBILITY_LABEL) as Mobility[]).map((m) => (
            <button type="button" key={m} className="chip" aria-pressed={mobility === m} onClick={() => setMobility(m)}>{MOBILITY_LABEL[m]}</button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="allergy" className="mb-2 block text-lg font-bold">Allergies (optional)</label>
        <input id="allergy" className="field" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Peanuts" />
      </div>
      <div>
        <label htmlFor="addr" className="mb-2 block text-lg font-bold">Home address for visits & delivery</label>
        <textarea id="addr" rows={2} className="field" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button className="btn btn-primary w-full" disabled={!address.trim()} onClick={() => onSubmit({ conditions, diet, mobility, allergies }, address.trim())}>{submitLabel}</button>
    </div>
  );
}
