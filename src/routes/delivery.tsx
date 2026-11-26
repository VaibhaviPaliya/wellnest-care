import { Button } from "@/components/ui/button";
import { InstallApp } from "@/components/InstallApp";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Bike, Clock, FileUp, MapPin, Navigation, Phone, PackageCheck, Power, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { LiveMap, type MapPoint } from "@/components/LiveMap";
import { useStore } from "@/lib/store";
import { useLiveLocation } from "@/lib/useLiveLocation";
import {
  RIDER_STATUS_LABEL, aadhaarFileProblem, addressLine, claimRider, distanceKm, etaMinutes, jobDetails, navigateUrl, offerSecondsLeft,
  respond, riderFeed, riderStatus, riderStatusUpdate, uploadAadhaar, type FeedItem, type JobDetails, type LatLng,
} from "@/lib/riders";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery Partner | WellNest" },
      { name: "description", content: "Accept WellNest meal and medicine deliveries, navigate to the customer and share your live location." },
      { property: "og:title", content: "WellNest Delivery Partner" },
      { property: "og:description", content: "Deliveries for your medical store or kitchen, with live tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Shell roles={["delivery"]}><Rider /></Shell>,
});

function Rider() {
  const { me, db, cloud, refresh } = useStore();
  const mine = db.delivery.filter((d) => d.riderUserId && d.riderUserId === me?.id);
  const verified = mine.some((d) => d.verified);
  const [online, setOnline] = useState(false);
  const { pos, error: gpsError } = useLiveLocation(online && verified);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [now, setNow] = useState(Date.now());

  // Link this account to any store that listed this mobile number.
  useEffect(() => { if (cloud) void claimRider().then((n) => { if (n) void refresh(); }).catch(() => undefined); }, [cloud, refresh]);

  const load = useCallback(async () => {
    if (!cloud || !mine.length) return;
    try { setFeed(await riderFeed()); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load orders."); }
  }, [cloud, mine.length]);
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), online ? 6000 : 20000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load, online]);

  if (!me) return null;
  if (!cloud) return <><PageTitle title="Delivery partner" back={false} /><p className="surface p-5">Deliveries need WellNest Cloud. Please sign in again with your mobile number.</p></>;

  const offers = feed.filter((f) => f.kind === "offer" && offerSecondsLeft(f.data.offer, now) > 0);
  const jobs = feed.filter((f) => f.kind === "job");
  return (
    <>
      <PageTitle title={`Hi ${me.name.split(" ")[0]}`} sub="Deliveries for your medical store or kitchen" back={false} />
      <InstallApp className="mb-6" note="Open deliveries in one tap. Keep the app open while you deliver so customers can track you." />
      {!mine.length ? (
        <div className="surface space-y-2 p-5">
          <p className="flex items-center gap-2 text-base font-bold"><ShieldAlert className="h-5 w-5 text-amber-600" />Not linked to a store yet</p>
          {me.phone ? <p>Ask your medical store or kitchen to add <strong>+91 {me.phone}</strong> under <em>Delivery partners</em> in their WellNest dashboard. This page updates once they do.</p>
            : <p>Add your mobile number in <Link to="/profile" className="text-primary underline">Profile</Link> — your store links you by that number.</p>}
          <Button variant="care" size="care" className="btn btn-outline" onClick={() => void claimRider().then(() => refresh())}>Check again</Button>
        </div>
      ) : (
        <>
          <Verification />
          {verified && (
            <section className={`mt-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${online ? "border-emerald-300 bg-emerald-50" : "bg-card"}`}>
              <Power className={`h-8 w-8 ${online ? "text-emerald-600" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-base font-bold">{online ? "You’re online" : "You’re offline"}</p>
                <p className="text-sm">{online ? "New orders from your store will appear here. Keep this page open — your location is shared only while online." : "Go online to receive orders. Your location is not shared while offline."}</p>
                {online && gpsError && <p role="alert" className="mt-1 text-sm text-destructive">{gpsError}</p>}
                {online && pos && <p className="mt-1 text-xs text-muted-foreground">GPS accurate to ~{Math.round(pos.accuracy)} m</p>}
              </div>
              <Button variant="care" size="care" role="switch" aria-checked={online} className={`btn ${online ? "btn-outline" : "btn-primary"}`} onClick={() => setOnline(!online)}>{online ? "Go offline" : "Go online"}</Button>
            </section>
          )}
          {offers.map((f) => <OfferCard key={f.booking_id} item={f} secondsLeft={offerSecondsLeft(f.data.offer, now)} onDone={() => { void load(); void refresh(); }} />)}
          {jobs.map((f) => <JobCard key={f.booking_id} item={f} me={pos} online={online} onDone={() => { void load(); void refresh(); }} />)}
          {verified && online && !offers.length && !jobs.length && <p className="surface mt-6 p-5 text-muted-foreground">No orders right now. We’ll show the next one here.</p>}
        </>
      )}
    </>
  );
}

function Verification() {
  const { me, db, refresh } = useStore();
  const mine = db.delivery.filter((d) => d.riderUserId === me?.id);
  const needsDoc = mine.some((d) => !d.docUploadedAt || d.status === "rejected");
  const [name, setName] = useState(mine[0]?.aadhaarName ?? me?.name ?? "");
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const store = (id?: string) => [...db.pharmacies, ...db.kitchens].find((p) => p.id === id)?.name ?? "Your store";
  const pick = (input: HTMLInputElement) => {
    const f = input.files?.[0];
    if (!f) return;
    const problem = aadhaarFileProblem(f);
    if (problem) { input.value = ""; return toast.error(problem); }
    const r = new FileReader();
    r.onload = () => setFile({ name: f.name, data: String(r.result) });
    r.readAsDataURL(f);
  };
  const send = async () => {
    if (!file) return;
    setBusy(true);
    try { await uploadAadhaar(file.data, name); toast.success("Uploaded. The WellNest team will verify it shortly."); setFile(null); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); }
  };
  return (
    <section className="surface p-5">
      <h2 className="text-lg font-bold">Your stores</h2>
      <ul className="mt-2 divide-y">
        {mine.map((d) => {
          const s = riderStatus(d);
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span><strong>{store(d.ownerPartnerId)}</strong> · {d.vehicle}</span>
              <span className={`flex items-center gap-1 text-sm font-semibold ${s === "verified" ? "text-success" : s === "rejected" ? "text-destructive" : "text-amber-700"}`}>
                {s === "verified" ? <BadgeCheck className="h-4 w-4" /> : <Clock className="h-4 w-4" />}{RIDER_STATUS_LABEL[s]}
              </span>
              {s === "rejected" && d.reviewNote && <p className="basis-full text-sm text-destructive">Reviewer’s note: {d.reviewNote}</p>}
            </li>
          );
        })}
      </ul>
      {needsDoc && (
        <div className="mt-3 space-y-3 border-t pt-4">
          <p className="font-bold">Upload your masked Aadhaar</p>
          <p className="text-sm text-muted-foreground">Download the <strong>masked Aadhaar</strong> from myaadhaar.uidai.gov.in or DigiLocker — it hides the first 8 digits. Please don’t upload a full Aadhaar. Only WellNest’s verification team can see this file; your store and customers cannot.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="font-bold">Name exactly as on Aadhaar<input className="field mt-1" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="btn btn-outline mt-auto cursor-pointer justify-center"><FileUp className="h-4 w-4" />{file ? file.name : "Choose file (JPG, PNG or PDF, ≤ 1 MB)"}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target)} /></label>
          </div>
          <Button variant="care" size="care" className="btn btn-primary" disabled={!file || !name.trim() || busy} onClick={() => void send()}>{busy ? "Uploading…" : "Submit for verification"}</Button>
        </div>
      )}
    </section>
  );
}

function OfferCard({ item, secondsLeft, onDone }: { item: FeedItem; secondsLeft: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const b = item.data;
  const act = async (accept: boolean) => {
    setBusy(true);
    try { await respond(b.id, accept); toast.success(accept ? "Order accepted — head to the store." : "Passed to the next rider."); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't respond."); onDone(); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-6 rounded-2xl border-2 border-primary bg-secondary p-5" role="alert">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-bold">New {b.type === "meal" ? "meal" : "medicine"} delivery</p>
        <span className="tag" aria-live="polite">{secondsLeft}s to accept</span>
      </div>
      <p className="mt-1">Pick up from <strong>{b.partnerName}</strong> · deliver to pincode <strong>{b.pincode ?? "—"}</strong></p>
      <p className="text-sm text-muted-foreground">{b.title} · by {fmtWhen(b.when)}</p>
      <div className="mt-4 flex gap-3">
        <Button variant="care" size="care" className="btn btn-outline flex-1" disabled={busy} onClick={() => void act(false)}>Decline</Button>
        <Button variant="care" size="care" className="btn btn-primary flex-1" disabled={busy} onClick={() => void act(true)}>Accept</Button>
      </div>
    </section>
  );
}

function JobCard({ item, me, online, onDone }: { item: FeedItem; me: LatLng | null; online: boolean; onDone: () => void }) {
  const b = item.data;
  const [job, setJob] = useState<JobDetails | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void jobDetails(b.id).then(setJob).catch(() => setJob(null)); }, [b.id]);
  const home = job?.home_lat != null && job.home_lng != null ? { lat: job.home_lat, lng: job.home_lng } : null;
  const points: MapPoint[] = [...(me ? [{ ...me, label: "R", title: "You" }] : []), ...(home ? [{ ...home, label: "H", title: job?.name ?? "Customer" }] : [])];
  const eta = me && home ? etaMinutes(distanceKm(me, home)) : null;
  const step = async (status: "out_for_delivery" | "completed") => {
    setBusy(true);
    try { await riderStatusUpdate(b.id, status); toast.success(status === "completed" ? "Delivered. Thank you!" : "Marked as picked up — the customer can now see you on the way."); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update."); }
    finally { setBusy(false); }
  };
  return (
    <section className="surface mt-6 space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-base font-bold"><Bike className="h-5 w-5 text-primary" />{b.title}</p>
        <span className="tag">{STATUS_LABEL[b.status] ?? b.status}</span>
      </div>
      <p className="text-sm">Pick up from <strong>{b.partnerName}</strong>{b.items?.length ? ` · ${b.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}` : ""}</p>
      {job ? (
        <div className="rounded-xl bg-muted p-3">
          <p className="font-bold">{job.name}</p>
          <p className="flex items-start gap-1 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{addressLine(job)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn btn-primary" href={navigateUrl(job)} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" />Navigate{eta ? ` · ~${eta} min` : ""}</a>
            {job.phone && <a className="btn btn-outline" href={`tel:+91${job.phone}`}><Phone className="h-4 w-4" />Call customer</a>}
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">Loading customer details…</p>}
      {points.length > 0 && <LiveMap points={points} height="h-64" />}
      {!online && <p role="alert" className="text-sm font-semibold text-amber-700">Go online so the customer can follow you.</p>}
      {b.status === "pending_review" && <p className="text-sm">Waiting for the pharmacist to confirm the prescription before pick-up.</p>}
      <div className="flex flex-wrap gap-3">
        {(b.status === "confirmed" || b.status === "in_progress") && <Button variant="care" size="care" className="btn btn-accent" disabled={busy} onClick={() => void step("out_for_delivery")}><PackageCheck className="h-4 w-4" />Picked up</Button>}
        {b.status === "out_for_delivery" && <Button variant="care" size="care" className="btn btn-primary" disabled={busy} onClick={() => void step("completed")}><BadgeCheck className="h-4 w-4" />Delivered</Button>}
      </div>
    </section>
  );
}
