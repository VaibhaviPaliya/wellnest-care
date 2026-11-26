import { useEffect, useRef, useState } from "react";
import { loadMap } from "./TrackingMap";

export type MapPoint = { lat: number; lng: number; label: string; title: string; color?: string };
// Google Maps types are not installed; only the few calls used here are typed.
type GMap = { fitBounds: (b: unknown, pad?: number) => void; setCenter: (p: { lat: number; lng: number }) => void; setZoom: (z: number) => void };
type GMarker = { setPosition: (p: { lat: number; lng: number }) => void; setMap: (m: GMap | null) => void };

/** Google map with labelled markers (e.g. R = rider, H = home, S = store). Re-fits when points move. */
export function LiveMap({ points, height = "h-72" }: { points: MapPoint[]; height?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const markers = useRef<Map<string, GMarker>>(new Map());
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    void loadMap().then(() => {
      if (cancelled || !el.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google.maps;
      map.current = new g.Map(el.current, { center: points[0] ?? { lat: 20.59, lng: 78.96 }, zoom: points.length ? 15 : 4, clickableIcons: false, streetViewControl: false, mapTypeControl: false });
      setState("ready");
    }).catch(() => { if (!cancelled) setState("failed"); });
    const ms = markers.current;
    return () => { cancelled = true; ms.forEach((m) => m.setMap(null)); ms.clear(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = points.map((p) => `${p.label}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    if (state !== "ready" || !map.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google.maps;
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.label);
      const existing = markers.current.get(p.label);
      if (existing) existing.setPosition(p);
      else markers.current.set(p.label, new g.Marker({ position: p, map: map.current, title: p.title, label: { text: p.label, color: "#fff", fontWeight: "700" } }));
    }
    for (const [label, m] of markers.current) if (!seen.has(label)) { m.setMap(null); markers.current.delete(label); }
    if (points.length > 1) {
      const b = new g.LatLngBounds();
      points.forEach((p) => b.extend(p));
      map.current.fitBounds(b, 48);
    } else if (points.length === 1) { map.current.setCenter(points[0]); map.current.setZoom(16); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state]);

  return (
    <div className="relative">
      <div ref={el} className={`${height} w-full rounded-xl border`} role="img" aria-label={points.map((p) => p.title).join(", ") || "Map"} />
      {state !== "ready" && <p className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted p-4 text-center text-sm">{state === "failed" ? "Map unavailable right now — the status and arrival time still update live." : "Loading map…"}</p>}
    </div>
  );
}
