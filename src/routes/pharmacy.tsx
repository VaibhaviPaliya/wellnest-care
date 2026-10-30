import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, FileUp, Check } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, UpiCheckout } from "@/components/Shell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/pharmacy")({
  head: () => ({
    meta: [
      { title: "Medicines & Doorstep Delivery | WellNest" },
      { name: "description", content: "Upload a doctor’s prescription or pick your medicines, send to a verified pharmacy and track delivery." },
      { property: "og:title", content: "Medicines & Doorstep Delivery | WellNest" },
      { property: "og:description", content: "Prescription medicines from verified pharmacies, delivered home." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Pharmacy /></Shell>,
});

function Pharmacy() {
  const { db, medicines, createBooking } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState<"upload" | "select">("upload");
  const [file, setFile] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const pharmacies = db.pharmacies.filter((p) => p.verified);
  const [ph, setPh] = useState(pharmacies[0]?.id ?? "");
  const [pay, setPay] = useState(false);

  const meds = medicines.filter((m) => picked.includes(m.id));
  const subtotal = mode === "select" ? meds.reduce((s, m) => s + m.price, 0) : 250;
  const total = subtotal + 20;
  const can = ph && (mode === "upload" ? !!file : picked.length > 0);
  const pharmacy = pharmacies.find((p) => p.id === ph);

  return (
    <>
      <PageTitle title="Medicines & Delivery" sub="Only licensed, verified pharmacies. Pharmacist checks every prescription." />
      <div className="flex gap-2">
        <button className="chip" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>Upload prescription</button>
        <button className="chip" aria-pressed={mode === "select"} onClick={() => setMode("select")}>Select medicines</button>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="surface p-5">
          {mode === "upload" ? (
            <>
              <h2 className="text-2xl font-bold">1. Doctor’s prescription</h2>
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:border-primary">
                <FileUp className="h-10 w-10 text-primary" />
                <span className="text-lg font-bold">{file ?? "Tap to upload photo or PDF"}</span>
                <span className="text-muted-foreground">JPG, PNG or PDF</span>
                <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
              </label>
              <p className="mt-3 text-muted-foreground">Estimated ₹250 — final price confirmed by the pharmacist.</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">1. Prescribed medicines</h2>
              <ul className="mt-3 space-y-2">
                {medicines.map((m) => {
                  const on = picked.includes(m.id);
                  return (
                    <li key={m.id}>
                      <button onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left ${on ? "border-primary bg-secondary" : ""}`}>
                        <span className={`grid h-7 w-7 place-items-center rounded-md border-2 ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{on && <Check className="h-5 w-5" />}</span>
                        <span className="flex-1"><strong>{m.name}</strong><span className="block text-sm text-muted-foreground">{m.dose}</span></span>
                        <span className="font-bold">₹{m.price}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="surface h-fit p-5">
          <h2 className="text-2xl font-bold">2. Choose pharmacy</h2>
          <ul className="mt-3 space-y-2">
            {pharmacies.map((p) => (
              <li key={p.id}>
                <button onClick={() => setPh(p.id)} aria-pressed={ph === p.id} className={`w-full rounded-xl border-2 p-3 text-left ${ph === p.id ? "border-primary bg-secondary" : ""}`}>
                  <strong className="flex items-center gap-1">{p.name}<BadgeCheck className="h-5 w-5 text-success" /></strong>
                  <span className="text-muted-foreground">{p.area} · delivers in ~{p.eta}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between"><span>Medicines</span><span>₹{subtotal}</span></p>
          <p className="flex justify-between text-muted-foreground"><span>Delivery</span><span>₹20</span></p>
          <p className="mt-2 flex justify-between border-t-2 pt-2 text-xl font-bold"><span>Total</span><span>₹{total}</span></p>
          <button className="btn btn-accent mt-4 w-full" disabled={!can} onClick={() => setPay(true)}>Send to pharmacy & pay</button>
        </div>
      </div>

      <UpiCheckout open={pay} amount={total} title={`Medicines from ${pharmacy?.name}`}
        onClose={() => { setPay(false); nav({ to: "/activity" }); }}
        onPaid={() => {
          const w = new Date(Date.now() + 60 * 60 * 1000);
          createBooking({ type: "medicine", title: mode === "upload" ? "Prescription order" : "Medicine order", partnerId: ph, partnerName: pharmacy!.name, amount: total, when: w.toISOString(), detail: mode === "upload" ? `Prescription: ${file}` : meds.map((m) => m.name).join(", "), prescription: file ?? undefined, items: meds.map((m) => ({ name: m.name, qty: 1, price: m.price })) });
          toast.success("Sent to pharmacy! Track delivery under Bookings.");
        }} />
    </>
  );
}
