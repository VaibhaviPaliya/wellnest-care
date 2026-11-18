import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

type Point = { lat: number; lng: number };
type MapsApi = { Map: new (element: HTMLElement, options: {center: Point; zoom: number; clickableIcons: boolean}) => {panTo: (point: Point) => void}; Marker: new (options: {position: Point; map: unknown}) => {setPosition: (point: Point) => void; setMap: (map: null) => void} };
declare global { interface Window { google?: { maps: MapsApi }; wellnestMapReady?: () => void } }
let load: Promise<MapsApi> | undefined;
function loadMap(): Promise<MapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (load) return load;
  load = new Promise((resolve, reject) => {
    window.wellnestMapReady = () => { if (window.google?.maps) resolve(window.google.maps); else reject(new Error('Map unavailable')); };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY']}&loading=async&callback=wellnestMapReady&channel=${import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID']}&language=en&region=IN`;
    script.onerror = () => { load = undefined; script.remove(); reject(new Error('Map unavailable')); };
    document.head.appendChild(script);
  });
  return load;
}
export function TrackingMap({lat, lng}: Point) {
  const { t } = useT();
  const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const map = useRef<InstanceType<MapsApi['Map']> | null>(null);
  const marker = useRef<InstanceType<MapsApi['Marker']> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMap().then(api => {
      if (cancelled || !element.current) return;
      map.current = new api.Map(element.current, {center: {lat, lng}, zoom: 16, clickableIcons: false});
      marker.current = new api.Marker({position: {lat, lng}, map: map.current});
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; marker.current?.setMap(null); };
  }, []);
  useEffect(() => { map.current?.panTo({lat, lng}); marker.current?.setPosition({lat, lng}); }, [lat, lng, ready]);
  return <div className="relative"><div ref={element} className="h-80 w-full rounded-lg border" aria-label={t('Partner location map')} />{!ready && <p className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center">{t(failed ? 'Map unavailable. Please try again later.' : 'Loading map…')}</p>}</div>;
}