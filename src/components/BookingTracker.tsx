import { useEffect, useState } from "react";
import { Bike, Footprints, Loader2, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveMap, type MapPoint } from "./LiveMap";
import { useStore } from "@/lib/store";
import { distanceKm, etaMinutes, fresh, trackBooking, type Tracking } from "@/lib/riders";
import type { Booking } from "@/lib/seed";

/** Bookings that can be tracked: open deliveries, home-visit fitness sessions and therapy visits. */
export const trackable = (b: Booking) =>
  !["completed", "cancelled"].includes(b.status) && !(b.type === "fitness" && b.videoUrl);

/**
 * Live position of the rider (meals, medicines) or coach (home visits) with an arrival estimate.
 * Polls every 8 s while open. Used by customers and family on Bookings, and by stores on their dashboard.
 */
export function BookingTracker({ booking, startOpen = false }: { booking: Booking; startOpen?: boolean }) {
  const { cloud } = useStore();
  const [open, setOpen] = useState(startOpen);
  const [t, setT] = useState<Tracking | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open || !cloud) return;
    let stop = false;
    const tick = async () => {
      try { const r = await trackBooking(booking.id); if (!stop) { setT(r); setError(""); } }
      catch (e) { if (!stop) setError(e instanceof Error ? e.message : "Tracking unavailable."); }
      finally { if (!stop) { setLoaded(true); setNow(Date.now()); } }
    };
    void tick();
    const id = setInterval(() => void tick(), 8000);
    return () => { stop = true; clearInterval(id); };
  }, [open, cloud, booking.id, booking.status, booking.deliveryId]);

  if (!trackable(booking)) return null;
  const isVisit = booking.type === "fitness" || booking.type === "therapy";
  if (!cloud) return <p className="mt-3 text-sm text-muted-foreground">Live tracking is available once you’re signed in to WellNest Cloud.</p>;

  const live = t && t.lat != null && t.lng != null && fresh(t.located_at, now);
  const here = live ? { lat: t!.lat!, lng: t!.lng! } : null;
  const home = t?.home_lat != null && t.home_lng != null ? { lat: t.home_lat, lng: t.home_lng } : null;
  const pickup = t?.pickup_lat != null && t.pickup_lng != null ? { lat: t.pickup_lat, lng: t.pickup_lng } : null;
  const headingToStore = !isVisit && booking.status !== "out_for_delivery";
  const target = headingToStore ? pickup : home;
  const eta = here && target ? etaMinutes(distanceKm(here, target)) : null;
  const name = t?.who ?? booking.deliveryName ?? booking.partnerName;

  const points: MapPoint[] = [
    ...(here ? [{ ...here, label: isVisit ? "C" : "R", title: `${name} (live)` }] : []),
    ...(home ? [{ ...home, label: "H", title: "Home" }] : []),
    ...(pickup && headingToStore ? [{ ...pickup, label: "S", title: booking.partnerName }] : []),
  ];

  let headline: string;
  if (!isVisit && !booking.deliveryId) headline = booking.offer ? `Finding a delivery partner — offered to ${booking.offer.riderName ?? "a rider"}` : "Finding a delivery partner nearby…";
  else if (!live) headline = isVisit ? `${name} hasn’t started sharing their location yet` : `${name} isn’t sharing a live location right now`;
  else if (isVisit) headline = eta ? `${name} is about ${eta} min away` : `${name} is on the way`;
  else if (headingToStore) headline = booking.status === "pending_review" ? `${name} is assigned · waiting for the pharmacist` : `${name} is heading to ${booking.partnerName}${eta ? ` · ~${eta} min` : ""}`;
  else headline = eta ? `On the way · arriving in about ${eta} min` : "On the way to you";

  return (
    <div className="mt-4">
      <Button variant="care" size="care" className="btn btn-outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Navigation className="h-4 w-4" />{open ? "Hide live tracking" : isVisit ? "Track coach" : "Track delivery"}
      </Button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border p-4">
          {!loaded ? <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Connecting…</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : (
            <>
              <p className="flex items-center gap-2 font-bold" aria-live="polite">
                {isVisit ? <Footprints className="h-5 w-5 text-primary" /> : <Bike className="h-5 w-5 text-primary" />}{headline}
              </p>
              {points.length > 0 && <LiveMap points={points} />}
              <p className="text-xs text-muted-foreground">
                {live ? <>Updated {Math.max(0, Math.round((now - Date.parse(t!.located_at!)) / 1000))} s ago{t?.accuracy ? ` · accurate to ~${Math.round(t.accuracy)} m` : ""}{t?.vehicle ? ` · ${t.vehicle}` : ""}. </> : null}
                {!home && <><MapPin className="inline h-3 w-3" /> Pin your exact home location in your profile for better arrival times. </>}
                Estimates assume city traffic.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
