import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import { CONDITION_LABEL, DIET_LABEL, MOBILITY_LABEL, type Condition, type DietPref, type HealthProfile, type MedicalRecord, type Mobility } from "@/lib/seed";

export function HealthForm({ initial, initialAddress, submitLabel, onSubmit }: { initial?: HealthProfile; initialAddress?: string; submitLabel: string; onSubmit: (h: HealthProfile, address: string) => void }) {
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [diet, setDiet] = useState<DietPref>(initial?.diet ?? "veg");
  const [mobility, setMobility] = useState<Mobility>(initial?.mobility ?? "independent");
  const [allergies, setAllergies] = useState(initial?.allergies ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [records, setRecords] = useState<MedicalRecord[]>(initial?.records ?? []);
  const [history, setHistory] = useState(initial?.history ?? "");
  const addFiles = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      if (!["image/jpeg", "image/png", "application/pdf"].includes(f.type)) { toast.error(`${f.name}: please use JPG, PNG or PDF.`); continue; }
      if (f.size > 1024 * 1024) { toast.error(`${f.name} is larger than 1 MB.`); continue; }
      const r = new FileReader();
      r.onload = () => setRecords((x) => x.length >= 5 ? (toast.error("Up to 5 records."), x) : [...x, { id: Math.random().toString(36).slice(2), name: f.name, type: f.type, size: f.size, data: String(r.result), at: new Date().toISOString() }]);
      r.readAsDataURL(f);
    }
  };
  const toggle = (c: Condition) => setConditions((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  return (
    <div className="mt-6 space-y-6">
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Health conditions (choose all that apply)</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
            <Button variant="care" size="care" type="button" key={c} className="chip" aria-pressed={conditions.includes(c)} onClick={() => toggle(c)}>{CONDITION_LABEL[c]}</Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Food preference</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIET_LABEL) as DietPref[]).map((d) => (
            <Button variant="care" size="care" type="button" key={d} className="chip" aria-pressed={diet === d} onClick={() => setDiet(d)}>{DIET_LABEL[d]}</Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-lg font-bold">Mobility</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOBILITY_LABEL) as Mobility[]).map((m) => (
            <Button variant="care" size="care" type="button" key={m} className="chip" aria-pressed={mobility === m} onClick={() => setMobility(m)}>{MOBILITY_LABEL[m]}</Button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="allergy" className="mb-2 block text-lg font-bold">Allergies (optional)</label>
        <input id="allergy" className="field" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Peanuts" />
      </div>
      <fieldset>
        <legend className="mb-1 text-lg font-bold">Past hospital or doctor records (optional)</legend>
        <p className="mb-2 text-muted-foreground">Upload discharge summaries, reports or prescriptions — JPG, PNG or PDF, up to 1 MB each.</p>
        <label className="btn btn-outline inline-flex cursor-pointer items-center gap-2"><FileText className="h-5 w-5" />Add a record<input type="file" accept="image/jpeg,image/png,application/pdf" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
        {records.length > 0 && <ul className="mt-3 space-y-2">{records.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border-2 p-3"><span className="truncate">{r.name} · {Math.ceil(r.size / 1024)} KB</span><Button variant="care" size="care" type="button" aria-label={`Remove ${r.name}`} className="min-h-11 text-destructive" onClick={() => setRecords((x) => x.filter((y) => y.id !== r.id))}><X className="h-5 w-5" /></Button></li>)}</ul>}
        <label htmlFor="hist" className="mb-2 mt-4 block font-bold">Medical history notes (optional)</label>
        <textarea id="hist" rows={2} className="field" value={history} onChange={(e) => setHistory(e.target.value)} placeholder="e.g. Knee surgery 2019, on Metformin since 2020" />
      </fieldset>
      <div>
        <label htmlFor="addr" className="mb-2 block text-lg font-bold">Home address for visits & delivery</label>
        <textarea id="addr" rows={2} className="field" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <Button variant="care" size="care" className="btn btn-primary w-full" disabled={!address.trim()} onClick={() => onSubmit({ conditions, diet, mobility, allergies, records, history: history.trim() || undefined }, address.trim())}>{submitLabel}</Button>
    </div>
  );
}
