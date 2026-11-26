import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Clock, Dumbbell, Pill, Soup, XCircle, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { AddressFields, PincodeChips } from "@/components/AddressFields";
import { useStore } from "@/lib/store";
import { EMPTY_ADDRESS, formatAddress, isPincode } from "@/lib/pincode";
import { LICENCE_LABEL, PARTNER_LABEL, applicationProblem, listingStatus, type Listing, type PartnerApplication } from "@/lib/partners";
import { TAG_LABEL, type Coach, type Dish, type Kitchen, type PartnerType, type Pharmacy } from "@/lib/seed";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "Partner Dashboard | WellNest" },
      { name: "description", content: "Register your medical store, kitchen or fitness coaching with WellNest, get verified and manage orders." },
      { property: "og:title", content: "Partner with WellNest" },
      { property: "og:description", content: "Medical stores, kitchens and fitness coaches serving seniors near them." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Shell roles={["partner"]}><PartnerDashboard /></Shell>,
});

const KIND_ICON = { pharmacy: Pill, kitchen: Soup, coach: Dumbbell } as const;

function PartnerDashboard() {
  const { myListing } = useStore();
  const [editing, setEditing] = useState(false);
  if (!myListing) return (
    <>
      <PageTitle title="Join WellNest as a partner" sub="Tell us about your business. Our team verifies your licence before customers can see you." back={false} />
      <PartnerForm />
    </>
  );
  const { kind, listing } = myListing;
  return (
    <>
      <PageTitle title={listing.name} sub={PARTNER_LABEL[kind]} back={false} />
      <StatusCard listing={listing} onEdit={() => setEditing(true)} />
      {editing ? (
        <section className="mt-6">
          <h2 className="mb-1 text-lg font-bold">Edit your details</h2>
          <p className="mb-4 text-sm text-muted-foreground">Saving sends your listing back for verification. Customers won’t see you until it is approved again.</p>
          <PartnerForm kind={kind} listing={listing} onDone={() => setEditing(false)} />
        </section>
      ) : (
        <>
          <ListingSummary kind={kind} listing={listing} />
          {kind === "kitchen" && listing.verified && <Menu kitchen={listing as Kitchen} />}
          <Orders listing={listing} />
        </>
      )}
    </>
  );
}

function StatusCard({ listing, onEdit }: { listing: Listing; onEdit: () => void }) {
  const s = listingStatus(listing);
  const look = {
    pending: { Icon: Clock, cls: "border-amber-300 bg-amber-50", title: "Under review", body: "We are checking your licence and details. You’ll appear to customers in your service pincodes once approved." },
    approved: { Icon: BadgeCheck, cls: "border-emerald-300 bg-emerald-50", title: "Verified and live", body: `Customers in ${listing.servicePincodes?.length ?? 0} pincode${listing.servicePincodes?.length === 1 ? "" : "s"} can see and book you.` },
    rejected: { Icon: XCircle, cls: "border-red-300 bg-red-50", title: "Changes needed", body: listing.reviewNote ? `Reviewer’s note: ${listing.reviewNote}` : "Your application was not approved. Update your details and resubmit." },
    suspended: { Icon: XCircle, cls: "border-red-300 bg-red-50", title: "Not visible to customers", body: "An administrator has paused your listing. Contact WellNest support." },
  }[s];
  return (
    <div className={`flex flex-wrap items-start gap-4 rounded-2xl border p-5 ${look.cls}`} role="status">
      <look.Icon className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1 basis-60"><p className="text-base font-bold">{look.title}</p><p className="text-sm">{look.body}</p></div>
      <Button variant="care" size="care" className="btn btn-outline bg-card" onClick={onEdit}><Pencil className="h-4 w-4" />{s === "rejected" ? "Fix and resubmit" : "Edit details"}</Button>
    </div>
  );
}

function ListingSummary({ kind, listing }: { kind: PartnerType; listing: Listing }) {
  const c = listing as Coach, k = listing as Kitchen, p = listing as Pharmacy;
  const rows: [string, string][] = [
    [LICENCE_LABEL[kind], listing.licence ?? "—"],
    ["Contact", listing.contactPhone ? `+91 ${listing.contactPhone}` : "—"],
    ["Address", listing.address ? formatAddress(listing.address) : "—"],
    ...(kind === "pharmacy" ? [["Typical delivery time", p.eta]] as [string, string][] : []),
    ...(kind === "kitchen" ? [["Type", k.kind === "restaurant" ? "Restaurant" : "Home dabba service"], ["Customises meals", k.customizes ? "Yes" : "No"]] as [string, string][] : []),
    ...(kind === "coach" ? [["Classes", c.types.join(", ")], ["Mode", c.mode.map((m) => (m === "home" ? "Home visits" : "Online")).join(" + ")], ["Price", `₹${c.price} per session`], ["Time slots", c.slots.join(", ")]] as [string, string][] : []),
  ];
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Your listing</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        {rows.map(([k2, v]) => <div key={k2} className="contents"><dt className="font-semibold text-muted-foreground">{k2}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="mt-4 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" />Service pincodes</p>
      <div className="mt-2 flex flex-wrap gap-2">{(listing.servicePincodes ?? []).map((pin) => <span key={pin} className="tag">{pin}</span>)}</div>
      {kind === "coach" && !c.mode.includes("home") && <p className="mt-2 text-sm text-muted-foreground">Online-only coaches are shown to customers everywhere; pincodes apply to home visits.</p>}
    </section>
  );
}

const fromListing = (kind: PartnerType, l?: Listing): PartnerApplication => {
  const c = l as Coach | undefined, k = l as Kitchen | undefined, p = l as Pharmacy | undefined;
  return {
    name: l?.name ?? "", licence: l?.licence ?? "", contactPhone: l?.contactPhone ?? "", address: l?.address ?? EMPTY_ADDRESS,
    servicePincodes: l?.servicePincodes ?? [], eta: p?.eta ?? "60 min", kitchenKind: k?.kind ?? "dabba", customizes: k?.customizes ?? true,
    types: c?.types ?? [], mode: c?.mode ?? ["home"], level: c?.level ?? "gentle", price: c?.price ?? 499, slots: c?.slots ?? ["09:00", "17:00"],
    bio: c?.bio ?? "", years: c?.years ?? 0,
  };
};

function PartnerForm({ kind: fixedKind, listing, onDone }: { kind?: PartnerType; listing?: Listing; onDone?: () => void }) {
  const { submitPartner } = useStore();
  const [kind, setKind] = useState<PartnerType | null>(fixedKind ?? null);
  const [a, setA] = useState<PartnerApplication>(() => fromListing(fixedKind ?? "pharmacy", listing));
  const [slotText, setSlotText] = useState(a.slots?.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PartnerApplication>(k: K, v: PartnerApplication[K]) => setA((x) => ({ ...x, [k]: v }));

  if (!kind) return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(["pharmacy", "kitchen", "coach"] as const).map((k) => {
        const Icon = KIND_ICON[k];
        return (
          <button key={k} type="button" onClick={() => setKind(k)} className="surface flex flex-col items-start gap-2 p-5 text-left transition hover:border-primary">
            <Icon className="h-8 w-8 text-primary" /><span className="text-base font-bold">{PARTNER_LABEL[k]}</span>
            <span className="text-sm text-muted-foreground">{k === "pharmacy" ? "Deliver prescription and OTC medicines" : k === "kitchen" ? "Health-suited meals and dabbas" : "Yoga, mobility or meditation — home or online"}</span>
          </button>
        );
      })}
    </div>
  );

  const app = { ...a, slots: slotText.split(/[\s,]+/).filter(Boolean) };
  const problem = applicationProblem(kind, app);
  const submit = async () => {
    if (problem) return toast.error(problem);
    setBusy(true);
    const err = await submitPartner(kind, app);
    setBusy(false);
    if (err) return toast.error(err);
    toast.success("Submitted for verification. We’ll review it shortly.");
    onDone?.();
  };
  const Icon = KIND_ICON[kind];
  return (
    <div className="surface max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-primary" />{PARTNER_LABEL[kind]}</p>
        {!fixedKind && <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setKind(null)}>Change type</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="pn" className="mb-1 block font-bold">{kind === "coach" ? "Your full name" : "Business name"}</label><input id="pn" className="field" maxLength={120} value={a.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label htmlFor="pl" className="mb-1 block font-bold">{LICENCE_LABEL[kind]}</label><input id="pl" className="field" maxLength={80} value={a.licence} onChange={(e) => set("licence", e.target.value)} /></div>
        <div><label htmlFor="pp" className="mb-1 block font-bold">Contact mobile</label>
          <div className="flex gap-2"><span className="field w-auto shrink-0 font-semibold">+91</span><input id="pp" className="field" inputMode="numeric" maxLength={10} value={a.contactPhone} onChange={(e) => set("contactPhone", e.target.value.replace(/\D/g, ""))} /></div></div>
      </div>
      <fieldset>
        <legend className="mb-2 text-base font-bold">{kind === "coach" ? "Your base address" : "Business address"}</legend>
        <AddressFields idPrefix="biz" value={a.address} onChange={(addr) => setA((x) => ({ ...x, address: addr, servicePincodes: x.servicePincodes.length || !isPincode(addr.pincode) ? x.servicePincodes : [addr.pincode] }))} />
      </fieldset>
      <div>
        <PincodeChips value={a.servicePincodes} onChange={(v) => set("servicePincodes", v)} />
        <p className="mt-1 text-xs text-muted-foreground">{kind === "coach" ? "Where you can make home visits." : "Where you can deliver."} Your own pincode is added automatically; add nearby ones too.</p>
      </div>

      {kind === "pharmacy" && (
        <div className="max-w-xs"><label htmlFor="eta" className="mb-1 block font-bold">Typical delivery time</label>
          <select id="eta" className="field" value={a.eta} onChange={(e) => set("eta", e.target.value)}>{["30 min", "45 min", "60 min", "90 min", "2 hrs", "Same day"].map((x) => <option key={x}>{x}</option>)}</select></div>
      )}
      {kind === "kitchen" && (
        <div className="flex flex-wrap gap-4">
          <div><label htmlFor="kk" className="mb-1 block font-bold">Kitchen type</label>
            <select id="kk" className="field" value={a.kitchenKind} onChange={(e) => set("kitchenKind", e.target.value as "dabba" | "restaurant")}><option value="dabba">Home dabba service</option><option value="restaurant">Restaurant</option></select></div>
          <label className="mt-7 flex items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={!!a.customizes} onChange={(e) => set("customizes", e.target.checked)} />We can customise meals on request</label>
        </div>
      )}
      {kind === "coach" && (
        <div className="space-y-4">
          <fieldset><legend className="mb-2 font-bold">Classes you teach</legend><div className="flex flex-wrap gap-2">
            {(["yoga", "mobility", "meditation"] as const).map((t) => <Button key={t} type="button" variant="care" size="care" className="chip capitalize" aria-pressed={a.types?.includes(t)} onClick={() => set("types", a.types?.includes(t) ? a.types.filter((x) => x !== t) : [...(a.types ?? []), t])}>{t}</Button>)}
          </div></fieldset>
          <fieldset><legend className="mb-2 font-bold">How you teach</legend><div className="flex flex-wrap gap-2">
            {(["home", "online"] as const).map((m) => <Button key={m} type="button" variant="care" size="care" className="chip" aria-pressed={a.mode?.includes(m)} onClick={() => set("mode", a.mode?.includes(m) ? a.mode.filter((x) => x !== m) : [...(a.mode ?? []), m])}>{m === "home" ? "Home visits" : "Online live classes"}</Button>)}
          </div></fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label htmlFor="cl" className="mb-1 block font-bold">Level</label><select id="cl" className="field" value={a.level} onChange={(e) => set("level", e.target.value as Coach["level"])}><option value="gentle">Gentle</option><option value="moderate">Moderate</option></select></div>
            <div><label htmlFor="cp" className="mb-1 block font-bold">Price per session (₹)</label><input id="cp" className="field" inputMode="numeric" value={a.price ?? ""} onChange={(e) => set("price", Number(e.target.value.replace(/\D/g, "")) || undefined)} /></div>
            <div><label htmlFor="cy" className="mb-1 block font-bold">Years of experience</label><input id="cy" className="field" inputMode="numeric" maxLength={2} value={a.years ?? ""} onChange={(e) => set("years", Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>
          </div>
          <div><label htmlFor="cs" className="mb-1 block font-bold">Daily time slots</label><input id="cs" className="field" placeholder="07:00, 09:00, 17:00" value={slotText} onChange={(e) => setSlotText(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">24-hour times, separated by commas.</p></div>
          <div><label htmlFor="cb" className="mb-1 block font-bold">Short bio</label><textarea id="cb" rows={2} maxLength={300} className="field" value={a.bio} onChange={(e) => set("bio", e.target.value)} placeholder="e.g. Physio-trained, 10 years teaching chair yoga to seniors" /></div>
        </div>
      )}

      {problem && <p className="text-sm text-muted-foreground">To submit: {problem}</p>}
      <div className="flex flex-wrap gap-3">
        {onDone && <Button variant="care" size="care" className="btn btn-outline" onClick={onDone}>Cancel</Button>}
        <Button variant="care" size="care" className="btn btn-primary flex-1" disabled={!!problem || busy} onClick={() => void submit()}>{busy ? "Submitting…" : listing ? "Save and resubmit for verification" : "Submit for verification"}</Button>
      </div>
    </div>
  );
}

function Menu({ kitchen }: { kitchen: Kitchen }) {
  const { db, savePartnerDish, deletePartnerDish } = useStore();
  const dishes = db.dishes.filter((d) => d.kitchenId === kitchen.id);
  const blank = { id: undefined as string | undefined, name: "", price: 150, diet: "veg" as Dish["diet"], jain: false, desc: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const err = await savePartnerDish(f);
    setBusy(false);
    if (err) return toast.error(err);
    toast.success(f.id ? "Dish updated." : "Dish added. WellNest will add its health tags.");
    setF(blank);
  };
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Your menu</h2>
      <p className="text-sm text-muted-foreground">WellNest’s nutrition team adds health tags (low sugar, soft food…) before a dish is suggested to seniors with those conditions.</p>
      <ul className="mt-3 divide-y">
        {dishes.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="font-bold">{d.name} <span className="font-normal text-muted-foreground">· ₹{d.price} · {d.diet === "veg" ? "Veg" : d.diet === "egg" ? "Egg" : "Non-veg"}</span></p>
              <div className="mt-1 flex flex-wrap gap-1">{d.tags.length ? d.tags.map((t) => <span key={t} className="tag">{TAG_LABEL[t]}</span>) : <span className="text-xs text-muted-foreground">Awaiting health tags</span>}</div></div>
            <div className="flex gap-2">
              <Button variant="care" size="care" className="btn btn-outline" aria-label={`Edit ${d.name}`} onClick={() => setF({ id: d.id, name: d.name, price: d.price, diet: d.diet, jain: d.jain, desc: d.desc })}><Pencil className="h-4 w-4" /></Button>
              <Button variant="care" size="care" className="btn btn-outline" aria-label={`Remove ${d.name}`} onClick={() => void deletePartnerDish(d.id).then((e) => (e ? toast.error(e) : toast.success("Dish removed.")))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
        {!dishes.length && <li className="py-3 text-muted-foreground">No dishes yet. Add your first one below.</li>}
      </ul>
      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div><label htmlFor="dn" className="mb-1 block font-bold">{f.id ? "Edit dish" : "New dish"}</label><input id="dn" className="field" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label htmlFor="dp" className="mb-1 block font-bold">Price (₹)</label><input id="dp" className="field" inputMode="numeric" value={f.price || ""} onChange={(e) => setF({ ...f, price: Number(e.target.value.replace(/\D/g, "")) })} /></div>
        <div><label htmlFor="dd" className="mb-1 block font-bold">Type</label><select id="dd" className="field" value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value as Dish["diet"] })}><option value="veg">Veg</option><option value="egg">Egg</option><option value="non_veg">Non-veg</option></select></div>
        <div className="sm:col-span-3"><label htmlFor="ds" className="mb-1 block font-bold">Short description</label><input id="ds" className="field" maxLength={300} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="e.g. Soft rice and lentils, lightly tempered" /></div>
        <label className="flex items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={f.jain} onChange={(e) => setF({ ...f, jain: e.target.checked })} />Jain-friendly</label>
        <div className="flex gap-2 sm:col-span-2 sm:justify-end">
          {f.id && <Button variant="care" size="care" className="btn btn-outline" onClick={() => setF(blank)}>Cancel</Button>}
          <Button variant="care" size="care" className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={() => void save()}>{f.id ? "Save dish" : "Add dish"}</Button>
        </div>
      </div>
    </section>
  );
}

function Orders({ listing }: { listing: Listing }) {
  const { db } = useStore();
  const orders = db.bookings.filter((b) => b.partnerId === listing.id).sort((x, y) => y.when.localeCompare(x.when));
  const who = (id: string) => db.users.find((u) => u.id === id);
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Orders & bookings</h2>
      {!listing.verified && <p className="text-sm text-muted-foreground">Orders appear here once your listing is approved.</p>}
      <ul className="mt-3 divide-y">
        {orders.map((b) => {
          const s = who(b.seniorId);
          return (
            <li key={b.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{b.title}</p><span className="tag">{STATUS_LABEL[b.status] ?? b.status}</span></div>
              <p className="text-sm text-muted-foreground">{fmtWhen(b.when)} · {s?.name ?? "Customer"} · ₹{b.amount}</p>
              {b.items?.length ? <p className="text-sm">{b.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p> : <p className="text-sm">{b.detail}</p>}
              {s?.address && <p className="mt-1 flex items-center gap-1 text-sm"><MapPin className="h-4 w-4 text-primary" />{[s.address, s.city, s.pincode].filter(Boolean).join(", ")}</p>}
              {b.prescriptionData && <a href={b.prescriptionData} download={b.prescription} className="mt-1 inline-block text-sm text-primary underline">Download prescription</a>}
            </li>
          );
        })}
        {listing.verified && !orders.length && <li className="py-3 text-muted-foreground">No orders yet.</li>}
      </ul>
    </section>
  );
}
