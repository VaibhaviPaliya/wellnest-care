import { useEffect, useRef, useState } from "react";
import { setPresence, type LatLng } from "./riders";

/**
 * Shares this phone's location while `active` (rider online, or coach on the way to a visit).
 * Sends at most one update every 10 s; going inactive tells the server to forget the location.
 * Works only while the page is open — browsers do not allow background GPS for web apps.
 */
export function useLiveLocation(active: boolean) {
  const [pos, setPos] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [error, setError] = useState("");
  const last = useRef(0);
  const sending = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setError("Location is not available on this device."); return; }
    setError("");
    last.current = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(here);
        if (sending.current || Date.now() - last.current < 10000) return;
        sending.current = true; last.current = Date.now();
        void setPresence(true, here).catch((e: Error) => setError(e.message)).finally(() => { sending.current = false; });
      },
      (e) => setError(e.code === 1 ? "Location permission denied. Allow location for this site in your phone settings." : "Couldn't read your location. Check that GPS is on."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => { navigator.geolocation.clearWatch(id); void setPresence(false).catch(() => undefined); };
  }, [active]);
  return { pos, error };
}
