import { Button } from "@/components/ui/button";
import { CertificateQueue } from '@/components/Certificates';
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { TAG_LABEL, type DietTag } from "@/lib/seed";
import { FLOW, canCancel } from "@/lib/booking-rules";
import { CareAdmin } from '@/components/CareFeatures';
import { RatingBadge } from '@/components/RatingBadge';
import { PartnerAvatar, resizePhoto } from '@/components/PartnerAvatar';
import { LICENCE_LABEL, PARTNER_KEY, PARTNER_LABEL, type Listing } from '@/lib/partners';
import { formatAddress } from '@/lib/pincode';
import { riderDocument, riderStatus, RIDER_STATUS_LABEL } from '@/lib/riders';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { Coach, Kitchen, PartnerType, Pharmacy } from '@/lib/seed';

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Admin Dashboard | WellNest" },
      { name: "description", content: "Verify partners, tag dishes for health suitability and review orders and bookings." },
      { property: "og:title", content: "Admin Dashboard | WellNest" },
      { property: "og:description", content: "WellNest partner verification and order review." },
    ],
  }),
  component: () => <Shell roles={["admin"]}><Admin /></Shell>,
});

type Tab = "partners" | "dishes" | "orders" | 'care';

function Admin() {
  const { db, toggleVerify, toggleDishTag, resetDemo, setStatus, setPartnerPhoto } = useStore();
  const pendingRiders = db.delivery.filter((d) => d.ownerPartnerId && riderStatus(d) === "pending").length;
  const pendingApps = (["pharmacy", "kitchen", "coach"] as const).flatMap((kind) => (db[PARTNER_KEY[kind]] as Listing[]).filter((l) => l.ownerId && !l.verified && l.status === "pending").map((listing) => ({ kind, listing })));
  const [tab, setTab] = useState<Tab>("partners");
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const stats = [
    ["Seniors", db.users.filter((u) => u.role === "senior").length],
    ["Verified partners", [...db.coaches, ...db.kitchens, ...db.pharmacies, ...db.delivery].filter((p) => p.verified).length],
    ["Dishes", db.dishes.length],
    ["Bookings & orders", db.bookings.length],
  ] as const;
  const kName = (id: string) => db.kitchens.find((k) => k.id === id)?.name;
  const uName = (id: string) => db.users.find((u) => u.id === id)?.name;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">Admin dashboard</h1>
        {reset ? <div className="flex flex-wrap gap-2"><Button variant="care" size="care" className="btn btn-outline min-h-11 text-base" onClick={() => setReset(false)}>Keep data</Button><Button variant="care" size="care" className="btn btn-danger min-h-11 text-base" onClick={() => { resetDemo(); toast.success("Demo data reset. Please sign in again."); }}>Confirm reset</Button></div> : <Button variant="care" size="care" className="btn btn-outline min-h-11 text-base" onClick={() => setReset(true)}>Reset demo data</Button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([l, v]) => <div key={l} className="surface p-4"><p className="font-display text-2xl font-bold">{v}</p><p className="text-muted-foreground">{l}</p></div>)}
      </div>
      <div className="my-6 flex flex-wrap gap-2">
        {([["partners", `Partner verification${pendingApps.length + pendingRiders ? ` (${pendingApps.length + pendingRiders} new)` : ""}`], ["dishes", "Dish health tags"], ["orders", "Orders & bookings"], ['care', 'Plans, menus & reviews']] as const).map(([k, l]) => <Button variant="care" size="care" key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</Button>)}
      </div>

      {tab === "partners" && (
        <div className="space-y-6">
          <Applications apps={pendingApps} />
          <RiderApplications />
          <CertificateQueue />
          {([["coaches", "coach", "Fitness coaches", "Unverified partners are hidden from search.", db.coaches.map((c) => ({ id: c.id, name: c.name, sub: [c.types.join(", "), pinsLabel(c)].filter(Boolean).join(" · "), verified: c.verified, type: "fitness" as const, fallback: c.rating, photo: c.photo }))],
             ["kitchens", "kitchen", "Partner kitchens", "Unverified partners are hidden from search.", db.kitchens.map((k) => ({ id: k.id, name: k.name, sub: [k.area, pinsLabel(k)].filter(Boolean).join(" · "), verified: k.verified, type: "meal" as const, fallback: 0, photo: k.photo }))],
             ["pharmacies", "pharmacy", "Pharmacies", "Unverified partners are hidden from search.", db.pharmacies.map((p) => ({ id: p.id, name: p.name, sub: [p.area, pinsLabel(p)].filter(Boolean).join(" · "), verified: p.verified, type: "medicine" as const, fallback: 0, photo: p.photo }))],
             ["delivery", "delivery", "Delivery partners", "Only verified delivery partners are assigned to meal and medicine orders. Unverifying someone moves their open orders to a verified partner.", db.delivery.map((x) => ({ id: x.id, name: x.name, sub: `${x.vehicle} · ${x.area} · ${((n) => `${n} open order${n === 1 ? "" : "s"}`)(db.bookings.filter((b) => b.deliveryId === x.id && !["completed", "cancelled"].includes(b.status)).length)}`, verified: x.verified, type: null, fallback: 0, photo: x.photo }))]] as const).map(([kind, pkind, title, note, rows]) => (
            <section key={kind} className="surface p-5">
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-muted-foreground">{note}</p>
              <ul className="mt-3 divide-y">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                      <PartnerAvatar kind={pkind} id={r.id} name={r.name} size={52} />
                      <div className="min-w-0"><p className="font-bold">{r.name}</p><p className="text-sm text-muted-foreground">{r.sub}</p>{r.type && <RatingBadge type={r.type} partnerId={r.id} fallback={r.fallback} />}
                        <div className="mt-1 flex flex-wrap gap-3 text-sm">
                          <label className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">{r.photo ? "Change photo" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) resizePhoto(f).then((url) => { const err = setPartnerPhoto(pkind, r.id, url); if (err) toast.error(err); else toast.success(`Photo saved for ${r.name}.`); }).catch((err: Error) => toast.error(err.message)); }} /></label>
                          {r.photo && <button type="button" className="font-semibold text-destructive underline" onClick={() => setPartnerPhoto(pkind, r.id, undefined)}>Remove photo</button>}
                        </div>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3">
                      <span className={`font-bold ${r.verified ? "text-success" : "text-destructive"}`}>{r.verified ? "Verified" : "Unverified"}</span>
                      <Button variant="care" size="care" role="switch" aria-checked={r.verified} aria-label={`Verify ${r.name}`} onClick={() => toggleVerify(kind, r.id)}
                        className={`relative h-8 w-14 rounded-full transition ${r.verified ? "bg-success" : "bg-input"}`}>
                        <span className={`absolute top-1 h-6 w-6 rounded-full bg-card transition-all ${r.verified ? "left-7" : "left-1"}`} />
                      </Button>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {tab === 'care' && <CareAdmin />}

      {tab === "dishes" && (
        <div className="surface overflow-x-auto p-5">
          <p className="mb-3 text-muted-foreground">Tap a tag to add or remove it. Seniors only see dishes carrying every tag their conditions require.</p>
          <ul className="divide-y">
            {db.dishes.map((d) => (
              <li key={d.id} className="py-3">
                <p className="font-bold">{d.name} <span className="font-normal text-muted-foreground">· {kName(d.kitchenId)} · {d.diet}</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(TAG_LABEL) as DietTag[]).map((t) => (
                    <Button variant="care" size="care" key={t} className="chip min-h-9 px-3 py-1 text-sm" aria-pressed={d.tags.includes(t)} onClick={() => toggleDishTag(d.id, t)}>{TAG_LABEL[t]}</Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "orders" && (
        <div className="surface overflow-x-auto p-2">
          <input aria-label="Search orders" className="field mb-3" placeholder="Search service, senior or partner" value={query} onChange={(e) => setQuery(e.target.value)} />
          <table className="w-full min-w-[720px] text-left">
            <thead><tr className="border-b">{["Service", "Senior", "Booked by", "Partner", "When", "Amount", "Status", "Review"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
            <tbody>
              {db.bookings.filter((b) => [b.title, b.partnerName, uName(b.seniorId)].join(" ").toLowerCase().includes(query.toLowerCase())).map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-3 font-bold">{b.title}{b.prescriptionData && <a href={b.prescriptionData} download={b.prescription} className="mt-2 block text-sm text-primary underline">View prescription</a>}<p className="text-sm font-normal text-muted-foreground">{b.detail}</p></td><td className="p-3">{uName(b.seniorId)}</td><td className="p-3">{uName(b.bookedBy)}</td>
                  <td className="p-3">{b.partnerName}{b.deliveryName && <p className="text-sm text-muted-foreground">Delivery: {b.deliveryName}</p>}</td><td className="p-3">{fmtWhen(b.when)}</td><td className="p-3">₹{b.amount}</td>
                  <td className="p-3"><span className="tag">{STATUS_LABEL[b.status]}</span>{(() => { const steps = FLOW[b.type]; const idx = steps.indexOf(b.status); const next = idx >= 0 ? steps[idx + 1] : undefined; return next ? <Button variant="care" size="care" className="btn btn-outline mt-2 min-h-11 text-sm" onClick={() => setStatus(b.id, next)}>{b.status === "pending_review" ? "Approve order" : `Mark ${STATUS_LABEL[next]}`}</Button> : null; })()}{canCancel(b) && <Button variant="care" size="care" className="mt-2 block text-sm text-destructive underline" onClick={() => setStatus(b.id, "cancelled")}>Cancel order</Button>}</td>
                  <td className="p-3">{b.review ? `${"★".repeat(b.review.rating)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const pinsLabel = (l: { servicePincodes?: string[] }) => l.servicePincodes?.length ? `Serves ${l.servicePincodes.slice(0, 4).join(", ")}${l.servicePincodes.length > 4 ? ` +${l.servicePincodes.length - 4}` : ""}` : "No service pincodes";

/** New partner applications: the admin checks the licence and details, then approves or asks for changes. */
function Applications({ apps }: { apps: { kind: PartnerType; listing: Listing }[] }) {
  const { reviewPartner } = useStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!apps.length) return <section className="surface p-5"><h2 className="text-lg font-bold">New partner applications</h2><p className="text-muted-foreground">No applications waiting for review.</p></section>;
  const act = (kind: PartnerType, l: Listing, approve: boolean) => {
    const err = reviewPartner(kind, l.id, approve, notes[l.id]);
    if (err) toast.error(err); else toast.success(approve ? `${l.name} is verified and now visible in ${l.servicePincodes?.length ?? 0} pincodes.` : `Sent back to ${l.name} with your note.`);
  };
  return (
    <section className="surface border-primary p-5">
      <h2 className="text-lg font-bold">New partner applications · {apps.length}</h2>
      <p className="text-muted-foreground">Check the licence number and address before approving. Approved partners appear to customers in the pincodes they serve.</p>
      <ul className="mt-3 divide-y">
        {apps.map(({ kind, listing: l }) => {
          const c = l as Coach, k = l as Kitchen, p = l as Pharmacy;
          return (
            <li key={l.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-base font-bold">{l.name}</p><span className="tag">{PARTNER_LABEL[kind]}</span></div>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted-foreground">{LICENCE_LABEL[kind]}</dt><dd className="font-semibold">{l.licence}</dd>
                <dt className="text-muted-foreground">Contact</dt><dd>+91 {l.contactPhone}</dd>
                <dt className="text-muted-foreground">Address</dt><dd>{l.address ? formatAddress(l.address) : "—"}</dd>
                <dt className="text-muted-foreground">Serves</dt><dd>{l.servicePincodes?.join(", ")}</dd>
                {kind === "pharmacy" && <><dt className="text-muted-foreground">Delivery time</dt><dd>{p.eta}</dd></>}
                {kind === "kitchen" && <><dt className="text-muted-foreground">Type</dt><dd>{k.kind === "restaurant" ? "Restaurant" : "Home dabba"}{k.customizes ? " · customises meals" : ""}</dd></>}
                {kind === "coach" && <><dt className="text-muted-foreground">Coaching</dt><dd>{c.types?.join(", ")} · {c.mode?.join(" + ")} · {c.level} · ₹{c.price} · {c.years} yrs</dd></>}
                {l.appliedAt && <><dt className="text-muted-foreground">Applied</dt><dd>{fmtWhen(l.appliedAt)}</dd></>}
              </dl>
              {kind === "coach" && c.bio && <p className="text-sm italic">“{c.bio}”</p>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 basis-64 text-sm font-semibold">Note to partner (needed to reject)
                  <input className="field mt-1" value={notes[l.id] ?? ""} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} placeholder="e.g. Licence number doesn’t match the store name" /></label>
                <Button variant="care" size="care" className="btn btn-outline" onClick={() => act(kind, l, false)}>Ask for changes</Button>
                <Button variant="care" size="care" className="btn btn-primary" onClick={() => act(kind, l, true)}>Approve</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Delivery partners listed by stores and kitchens: check the masked Aadhaar, then approve or ask for changes. */
function RiderApplications() {
  const { db, reviewRider } = useStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<{ name: string; data: string } | null>(null);
  const listed = db.delivery.filter((d) => d.ownerPartnerId && !d.verified);
  const store = (id?: string) => [...db.pharmacies, ...db.kitchens].find((p) => p.id === id)?.name ?? "Unknown store";
  const open = async (id: string, name: string) => {
    try { const data = await riderDocument(id); if (!data) return toast.error("No document uploaded yet."); setDoc({ name, data }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn’t open the document."); }
  };
  const act = (id: string, approve: boolean) => {
    const err = reviewRider(id, approve, notes[id]);
    if (err) toast.error(err); else toast.success(approve ? "Verified — they can now receive orders." : "Sent back with your note.");
  };
  return (
    <section className="surface p-5">
      <h2 className="text-lg font-bold">Delivery partner verification · {listed.filter((d) => riderStatus(d) === "pending").length}</h2>
      <p className="text-muted-foreground">Open the masked Aadhaar, check the name matches and only the last 4 digits are visible, then approve. Reject full (unmasked) Aadhaar uploads.</p>
      <ul className="mt-3 divide-y">
        {listed.map((d) => {
          const st = riderStatus(d);
          return (
            <li key={d.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-bold">{d.name} <span className="font-normal text-muted-foreground">· {d.vehicle} · {store(d.ownerPartnerId)}</span></p><span className="tag">{RIDER_STATUS_LABEL[st]}</span></div>
              <p className="text-sm">{d.phone ? `+91 ${d.phone}` : ""}{d.aadhaarName ? ` · Name on Aadhaar: ${d.aadhaarName}` : ""}{d.docUploadedAt ? ` · uploaded ${fmtWhen(d.docUploadedAt)}` : ""}</p>
              {st === "pending" && (
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="care" size="care" className="btn btn-outline" onClick={() => void open(d.id, d.name)}>View masked Aadhaar</Button>
                  <label className="min-w-0 flex-1 basis-56 text-sm font-semibold">Note (needed to reject)<input className="field mt-1" value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} placeholder="e.g. Upload the masked version" /></label>
                  <Button variant="care" size="care" className="btn btn-outline" onClick={() => act(d.id, false)}>Ask for changes</Button>
                  <Button variant="care" size="care" className="btn btn-primary" onClick={() => act(d.id, true)}>Approve</Button>
                </div>
              )}
            </li>
          );
        })}
        {!listed.length && <li className="py-3 text-muted-foreground">No delivery partners waiting.</li>}
      </ul>
      <Dialog open={!!doc} onOpenChange={(v) => { if (!v) setDoc(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Masked Aadhaar · {doc?.name}</DialogTitle>
          <DialogDescription>Shown to administrators only. Don’t download or share it.</DialogDescription>
          {doc && (doc.data.startsWith("data:application/pdf")
            ? <object data={doc.data} type="application/pdf" className="h-[70vh] w-full rounded border" aria-label="Aadhaar PDF">PDF preview isn’t supported in this browser.</object>
            : <img src={doc.data} alt={`Masked Aadhaar of ${doc.name}`} className="max-h-[70vh] w-full rounded border object-contain" />)}
        </DialogContent>
      </Dialog>
    </section>
  );
}
