import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { INDIAN_STATES, isPincode, normalizeState, stateFromPincode, type Address } from "@/lib/pincode";
import { lookupPincode } from "@/lib/pincode.functions";

/**
 * House/street, pincode, city and state. Typing a valid Indian pincode fills the state straight away
 * (from the pincode's first digits) and the city from India Post; both stay editable.
 */
export function AddressFields({ value, onChange, idPrefix = "addr", lineLabel = "House / flat, street and area" }: { value: Address; onChange: (a: Address) => void; idPrefix?: string; lineLabel?: string }) {
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState("");
  const [localities, setLocalities] = useState<string[]>([]);
  const latest = useRef(value);
  latest.current = value;
  const asked = useRef("");

  useEffect(() => {
    const pin = value.pincode;
    if (!isPincode(pin) || asked.current === pin) return;
    asked.current = pin;
    setLooking(true); setNote(""); setLocalities([]);
    void lookupPincode({ data: { pincode: pin } })
      .then((r) => {
        if (latest.current.pincode !== pin) return;
        if (!r) { setNote("Couldn't look up this pincode — please check the city and state."); return; }
        const state = normalizeState(r.state) ?? latest.current.state;
        onChange({ ...latest.current, city: r.city, state });
        setLocalities(r.localities);
        setNote(`Filled from India Post: ${r.city}, ${state}. You can edit these.`);
      })
      .catch(() => { if (latest.current.pincode === pin) setNote("Couldn't look up this pincode — please check the city and state."); })
      .finally(() => { if (latest.current.pincode === pin) setLooking(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.pincode]);

  const setPin = (raw: string) => {
    const pincode = raw.replace(/\D/g, "").slice(0, 6);
    const guess = stateFromPincode(pincode);
    onChange({ ...value, pincode, ...(guess && pincode !== value.pincode ? { state: guess } : {}) });
  };
  const pinBad = value.pincode.length === 6 && !isPincode(value.pincode);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-line`} className="mb-1 block font-bold">{lineLabel}</label>
        <input id={`${idPrefix}-line`} className="field" autoComplete="street-address" value={value.line} maxLength={200}
          onChange={(e) => onChange({ ...value, line: e.target.value })} list={localities.length ? `${idPrefix}-areas` : undefined} />
        {localities.length > 0 && <datalist id={`${idPrefix}-areas`}>{localities.map((l) => <option key={l} value={`${value.line ? value.line + ", " : ""}${l}`} />)}</datalist>}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-pin`} className="mb-1 block font-bold">Pincode</label>
        <div className="relative">
          <input id={`${idPrefix}-pin`} className="field" inputMode="numeric" autoComplete="postal-code" placeholder="e.g. 560011"
            value={value.pincode} onChange={(e) => setPin(e.target.value)} aria-invalid={pinBad} aria-describedby={`${idPrefix}-pin-note`} />
          {looking && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Looking up pincode" />}
        </div>
        <p id={`${idPrefix}-pin-note`} className={`mt-1 text-xs ${pinBad ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
          {pinBad ? "Indian pincodes are 6 digits and don't start with 0 or 9." : note || "6-digit Indian pincode"}
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-city`} className="mb-1 block font-bold">City / district</label>
        <input id={`${idPrefix}-city`} className="field" autoComplete="address-level2" value={value.city} maxLength={80}
          onChange={(e) => onChange({ ...value, city: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-state`} className="mb-1 block font-bold">State / union territory</label>
        <select id={`${idPrefix}-state`} className="field" autoComplete="address-level1" value={value.state}
          onChange={(e) => onChange({ ...value, state: e.target.value })}>
          <option value="">Choose state</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Service-area pincodes for partners: type or paste several, shown as removable chips. */
export function PincodeChips({ value, onChange, id = "service-pins" }: { value: string[]; onChange: (pins: string[]) => void; id?: string }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const add = () => {
    const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const ok = parts.filter(isPincode);
    setBad(parts.filter((x) => !isPincode(x)));
    if (ok.length) onChange([...new Set([...value, ...ok])].slice(0, 50));
    setText("");
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">Pincodes you serve</label>
      <div className="flex gap-2">
        <input id={id} className="field" inputMode="numeric" placeholder="560011, 560041…" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-outline shrink-0" onClick={add} disabled={!text.trim()}>Add</button>
      </div>
      {bad.length > 0 && <p className="mt-1 text-xs text-destructive" role="alert">Not valid Indian pincodes: {bad.join(", ")}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {value.map((p) => (
          <span key={p} className="tag inline-flex items-center gap-1">{p}
            <button type="button" className="ml-1 font-bold" aria-label={`Remove ${p}`} onClick={() => onChange(value.filter((x) => x !== p))}>×</button>
          </span>
        ))}
        {!value.length && <span className="text-sm text-muted-foreground">Customers only see you in the pincodes listed here.</span>}
      </div>
    </div>
  );
}
