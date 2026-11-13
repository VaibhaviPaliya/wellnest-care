import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { TAG_LABEL, type DietTag } from "@/lib/seed";
import { FLOW, canCancel } from "@/lib/booking-rules";
import { CareAdmin } from '@/components/CareFeatures';

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
  const { db, toggleVerify, toggleDishTag, resetDemo, setStatus } = useStore();
  const [tab, setTab] = useState<Tab>("partners");
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const stats = [
    ["Seniors", db.users.filter((u) => u.role === "senior").length],
    ["Verified partners", [...db.coaches, ...db.kitchens, ...db.pharmacies].filter((p) => p.verified).length],
    ["Dishes", db.dishes.length],
    ["Bookings & orders", db.bookings.length],
  ] as const;
  const kName = (id: string) => db.kitchens.find((k) => k.id === id)?.name;
  const uName = (id: string) => db.users.find((u) => u.id === id)?.name;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold md:text-4xl">Admin dashboard</h1>
        {reset ? <div className="flex flex-wrap gap-2"><Button variant="care" size="care" className="btn btn-outline min-h-11 text-base" onClick={() => setReset(false)}>Keep data</Button><Button variant="care" size="care" className="btn btn-danger min-h-11 text-base" onClick={() => { resetDemo(); toast.success("Demo data reset. Please sign in again."); }}>Confirm reset</Button></div> : <Button variant="care" size="care" className="btn btn-outline min-h-11 text-base" onClick={() => setReset(true)}>Reset demo data</Button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([l, v]) => <div key={l} className="surface p-4"><p className="font-display text-3xl font-bold">{v}</p><p className="text-muted-foreground">{l}</p></div>)}
      </div>
      <div className="my-6 flex flex-wrap gap-2">
        {([["partners", "Partner verification"], ["dishes", "Dish health tags"], ["orders", "Orders & bookings"], ['care', 'Plans, menus & reviews']] as const).map(([k, l]) => <Button variant="care" size="care" key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</Button>)}
      </div>

      {tab === "partners" && (
        <div className="space-y-6">
          {([["coaches", "Fitness coaches", db.coaches.map((c) => ({ id: c.id, name: c.name, sub: c.types.join(", "), verified: c.verified }))],
             ["kitchens", "Partner kitchens", db.kitchens.map((k) => ({ id: k.id, name: k.name, sub: k.area, verified: k.verified }))],
             ["pharmacies", "Pharmacies", db.pharmacies.map((p) => ({ id: p.id, name: p.name, sub: p.area, verified: p.verified }))]] as const).map(([kind, title, rows]) => (
            <section key={kind} className="surface p-5">
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-muted-foreground">Unverified partners are hidden from search.</p>
              <ul className="mt-3 divide-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div><p className="font-bold">{r.name}</p><p className="text-sm capitalize text-muted-foreground">{r.sub}</p></div>
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
          <ul className="divide-y-2">
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
            <thead><tr className="border-b-2">{["Service", "Senior", "Booked by", "Partner", "When", "Amount", "Status", "Review"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
            <tbody>
              {db.bookings.filter((b) => [b.title, b.partnerName, uName(b.seniorId)].join(" ").toLowerCase().includes(query.toLowerCase())).map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-3 font-bold">{b.title}{b.prescriptionData && <a href={b.prescriptionData} download={b.prescription} className="mt-2 block text-sm text-primary underline">View prescription</a>}<p className="text-sm font-normal text-muted-foreground">{b.detail}</p></td><td className="p-3">{uName(b.seniorId)}</td><td className="p-3">{uName(b.bookedBy)}</td>
                  <td className="p-3">{b.partnerName}</td><td className="p-3">{fmtWhen(b.when)}</td><td className="p-3">₹{b.amount}</td>
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
