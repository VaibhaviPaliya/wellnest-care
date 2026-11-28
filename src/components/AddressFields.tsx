import { useEffect, useRef, useState } from "react";
import { Crosshair, ExternalLink, Loader2 } from "lucide-react";
import { loadMap } from "./TrackingMap";
import { currentPosition } from "@/lib/riders";
import { INDIAN_STATES, isPincode, normalizeState, stateFromPincode, type Address } from "@/lib/pincode";
import { lookupPincode } from "@/lib/pincode.functions";

/**
 * House/street, pincode, city and state. Typing a valid Indian pincode fills the state straight away
 * (from the pincode's first digits) and the city from India Post; both stay editable.
 */
export function AddressFields({ value, onChange, idPrefix = "addr", lineLabel = "House / flat, street and area", allowPin = false }: { value: Address; onChange: (a: Address) => void; idPrefix?: string; lineLabel?: string; allowPin?: boolean }) {
  const [pinning, setPinning] = useState(false);
  const [pinNote, setPinNote] = useState("");
  const pinHere = async () => {
    setPinning(true); setPinNote("");
    try { const p = await currentPosition(); onChange({ ...latest.current, lat: p.lat, lng: p.lng }); setPinNote(`Pinned (accurate to ~${Math.round(p.accuracy)} m). Do this from home.`); }
    catch (e) { setPinNote(e instanceof Error ? e.message : "Couldn't read your location."); }
    finally { setPinning(false); }
  };
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
      {allowPin && (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-outline" onClick={() => void pinHere()} disabled={pinning}>
            <Crosshair className="h-4 w-4" />{pinning ? "Finding you…" : value.lat != null ? "Re-pin exact home location" : "Pin exact home location (optional)"}
          </button>
          {value.lat != null && <button type="button" className="text-sm font-semibold text-destructive underline" onClick={() => { onChange({ ...value, lat: undefined, lng: undefined }); setPinNote("Pin removed."); }}>Remove pin</button>}
          <span className="text-xs text-muted-foreground" aria-live="polite">{pinNote || (value.lat != null ? "Home pinned — riders and coaches navigate straight to it." : "Helps riders and coaches find the door and gives better arrival times.")}</span>
        </div>
      )}
      {allowPin && value.lat != null && value.lng != null && (
        <div className="sm:col-span-2">
          <PinMap lat={value.lat} lng={value.lng} onMove={(p) => { onChange({ ...latest.current, lat: p.lat, lng: p.lng }); setPinNote("Pin moved. Save to keep it."); }} />
        </div>
      )}
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

// Google Maps types are not installed; only the calls used here are typed.
type PinMapApi = { Map: new (el: HTMLElement, o: object) => { panTo: (p: object) => void; addListener: (e: string, f: (ev: { latLng: { lat: () => number; lng: () => number } }) => void) => void }; Marker: new (o: object) => { setPosition: (p: object) => void; addListener: (e: string, f: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } } };

/** Map of the pinned home. Drag the pin (or tap the map) to put it exactly on the house. */
function PinMap({ lat, lng, onMove }: { lat: number; lng: number; onMove: (p: { lat: number; lng: number }) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<InstanceType<PinMapApi["Map"]> | null>(null);
  const marker = useRef<InstanceType<PinMapApi["Marker"]> | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let cancelled = false;
    void loadMap().then((api) => {
      if (cancelled || !el.current) return;
      const g = api as unknown as PinMapApi;
      map.current = new g.Map(el.current, { center: { lat, lng }, zoom: 18, clickableIcons: false, streetViewControl: false, mapTypeControl: true, gestureHandling: "cooperative" });
      marker.current = new g.Marker({ position: { lat, lng }, map: map.current, draggable: true, title: "Your home" });
      marker.current.addListener("dragend", () => { const p = marker.current!.getPosition(); move.current({ lat: p.lat(), lng: p.lng() }); });
      map.current.addListener("click", (e) => { const p = { lat: e.latLng.lat(), lng: e.latLng.lng() }; marker.current?.setPosition(p); move.current(p); });
      setState("ready");
    }).catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (state !== "ready") return;
    marker.current?.setPosition({ lat, lng });
    map.current?.panTo({ lat, lng });
  }, [lat, lng, state]);
  const link = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={el} className="h-64 w-full rounded-xl border" role="img" aria-label="Map of your pinned home" />
        {state !== "ready" && (
          <p className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted p-4 text-center text-sm">
            {state === "failed" ? "Map unavailable right now. Use the link below to check the pin." : "Loading map…"}
          </p>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Not exactly on your house? Drag the pin or tap the right spot, then save.</span>
        <a className="inline-flex items-center gap-1 font-semibold text-primary underline" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open in Google Maps</a>
      </p>
    </div>
  );
}
