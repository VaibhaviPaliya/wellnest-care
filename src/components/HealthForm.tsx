import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import { MetricsFields } from './CareFeatures';
import { calorieTarget } from '@/lib/care';
import { AddressFields } from "./AddressFields";
import { addressProblem, EMPTY_ADDRESS, type Address } from "@/lib/pincode";
import { CONDITION_LABEL, DIET_LABEL, MOBILITY_LABEL, type Condition, type DietPref, type HealthProfile, type MedicalRecord, type Mobility } from "@/lib/seed";

export function HealthForm({ initial, initialAddress, submitLabel, onSubmit }: { initial?: HealthProfile; initialAddress?: Address; submitLabel: string; onSubmit: (h: HealthProfile, address: Address) => void }) {
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [diet, setDiet] = useState<DietPref>(initial?.diet ?? "veg");
  const [mobility, setMobility] = useState<Mobility>(initial?.mobility ?? "independent");
  const [allergies, setAllergies] = useState(initial?.allergies ?? "");
  const [address, setAddress] = useState<Address>(initialAddress ?? EMPTY_ADDRESS);
  const addrProblem = addressProblem(address);
  const [records, setRecords] = useState<MedicalRecord[]>(initial?.records ?? []);
  const [history, setHistory] = useState(initial?.history ?? "");
  const [metrics, setMetrics] = useState(initial?.metrics);
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
        <legend className="mb-2 text-base font-bold">Health conditions (choose all that apply)</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
            <Button variant="care" size="care" type="button" key={c} className="chip" aria-pressed={conditions.includes(c)} onClick={() => toggle(c)}>{CONDITION_LABEL[c]}</Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-base font-bold">Food preference</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIET_LABEL) as DietPref[]).map((d) => (
            <Button variant="care" size="care" type="button" key={d} className="chip" aria-pressed={diet === d} onClick={() => setDiet(d)}>{DIET_LABEL[d]}</Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-base font-bold">Mobility</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOBILITY_LABEL) as Mobility[]).map((m) => (
            <Button variant="care" size="care" type="button" key={m} className="chip" aria-pressed={mobility === m} onClick={() => setMobility(m)}>{MOBILITY_LABEL[m]}</Button>
          ))}
        </div>
      </fieldset>
      <MetricsFields value={metrics} onChange={setMetrics} />
      <div>
        <label htmlFor="allergy" className="mb-2 block text-base font-bold">Allergies (optional)</label>
        <input id="allergy" className="field" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Peanuts" />
      </div>
      <fieldset>
        <legend className="mb-1 text-base font-bold">Past hospital or doctor records (optional)</legend>
        <p className="mb-2 text-muted-foreground">Upload discharge summaries, reports or prescriptions — JPG, PNG or PDF, up to 1 MB each.</p>
        <label className="btn btn-outline inline-flex cursor-pointer items-center gap-2"><FileText className="h-5 w-5" />Add a record<input type="file" accept="image/jpeg,image/png,application/pdf" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
        {records.length > 0 && <ul className="mt-3 space-y-2">{records.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border p-3"><span className="truncate">{r.name} · {Math.ceil(r.size / 1024)} KB</span><Button variant="care" size="care" type="button" aria-label={`Remove ${r.name}`} className="min-h-11 text-destructive" onClick={() => setRecords((x) => x.filter((y) => y.id !== r.id))}><X className="h-5 w-5" /></Button></li>)}</ul>}
        <label htmlFor="hist" className="mb-2 mt-4 block font-bold">Medical history notes (optional)</label>
        <textarea id="hist" rows={2} className="field" value={history} onChange={(e) => setHistory(e.target.value)} placeholder="e.g. Knee surgery 2019, on Metformin since 2020" />
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-base font-bold">Home address for visits & delivery</legend>
        <p className="mb-3 text-sm text-muted-foreground">The pincode decides which pharmacies, kitchens and home-visit coaches are shown.</p>
        <AddressFields value={address} onChange={setAddress} />
        {addrProblem && (address.line || address.pincode) && <p className="mt-2 text-sm text-destructive">{addrProblem}</p>}
      </fieldset>
      <Button variant="care" size="care" className="btn btn-primary w-full" disabled={!!addrProblem || (!!metrics && !calorieTarget(metrics))} onClick={() => onSubmit({ conditions, diet, mobility, allergies, records, metrics, history: history.trim() || undefined }, { ...address, line: address.line.trim(), city: address.city.trim() })}>{submitLabel}</Button>
    </div>
  );
}
