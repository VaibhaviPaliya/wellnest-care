import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MapPin, Copy, Square, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { Booking } from '@/lib/seed';
import { useT } from '@/lib/i18n';
import { canTrackBooking, locationFresh } from '@/lib/tracking';
import { TrackingMap } from './TrackingMap';

type Session = Database['public']['Tables']['tracking_sessions']['Row'];
export function useTrackingIdentity() {
  const [identity, setIdentity] = useState<{id: string; email: string} | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({data}) => setIdentity(data.user?.email ? {id: data.user.id, email: data.user.email.toLowerCase()} : null));
    const {data} = supabase.auth.onAuthStateChange((_event, session) => setIdentity(session?.user.email ? {id: session.user.id, email: session.user.email.toLowerCase()} : null));
    return () => data.subscription.unsubscribe();
  }, []);
  return identity;
}
export function TrackingSession({sessionId}: {sessionId: string}) {
  const identity = useTrackingIdentity();
  const {t} = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [consent, setConsent] = useState(false);
  const watch = useRef<number | null>(null);
  const busy = useRef(false);
  const last = useRef(0);
  const clear = useCallback(() => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setSharing(false); }, []);
  const refresh = useCallback(async () => {
    const {data, error: problem} = await supabase.from('tracking_sessions').select('*').eq('id', sessionId).maybeSingle();
    setSession(data);
    setError(problem ? problem.message : !data ? t('Tracking unavailable, expired or not shared with this account.') : '');
  }, [sessionId, t]);
  useEffect(() => {
    if (!identity) { clear(); setSession(null); return; }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { clearInterval(timer); clear(); };
  }, [identity?.id, refresh, clear]);
  const active = !!session && !session.stopped && Date.parse(session.expires_at) > Date.now();
  useEffect(() => { if (!active) clear(); }, [active, clear]);
  const stop = async () => {
    clear();
    const {error: problem} = await supabase.rpc('stop_tracking', {_id: sessionId});
    if (problem) setError(problem.message);
    else await refresh();
  };
  const start = () => {
    if (!consent || !active) return;
    if (!navigator.geolocation) { setError(t('Location is not supported on this phone.')); return; }
    setError(''); setSharing(true); last.current = 0;
    watch.current = navigator.geolocation.watchPosition(position => {
      if (busy.current || Date.now() - last.current < 10000) return;
      busy.current = true; last.current = Date.now();
      void supabase.rpc('share_tracking', {_id: sessionId, _lat: position.coords.latitude, _lng: position.coords.longitude, _accuracy: position.coords.accuracy}).then(({error: problem}) => {
        busy.current = false;
        if (problem) { clear(); setError(problem.message); } else void refresh();
      });
    }, problem => { clear(); setError(t(problem.code === 1 ? 'Location permission denied. Allow location in your phone settings.' : 'Could not read your location. Check GPS and try again.')); }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
  };
  if (!identity) return <p>{t('Sign in with email to use private location tracking.')}</p>;
  const partner = identity.email === session?.partner_email;
  const organizer = identity.id === session?.owner_id;
  return <div className="mt-4 space-y-3 border-t pt-4">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {session && <>
      <p className="font-bold">{t(session.stopped ? 'Location sharing stopped' : !active ? 'Tracking expired' : sharing ? 'Sharing your location' : locationFresh(session.located_at) ? 'Live partner location' : session.located_at ? 'Location is stale — partner may be offline' : 'Waiting for partner location')}</p>
      <p className="text-sm text-muted-foreground">{t('Sharing ends at {time}', {time: new Date(session.expires_at).toLocaleString('en-IN')})}</p>
      {active && session.latitude !== null && session.longitude !== null && <><TrackingMap lat={session.latitude} lng={session.longitude} /><p className="text-sm">{t('Last update: {time} · accuracy about {meters} m', {time: session.located_at ? new Date(session.located_at).toLocaleTimeString('en-IN') : '—', meters: Math.round(session.accuracy ?? 0)})}</p></>}
      {partner && active && !sharing && <><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consent} onChange={e => setConsent(e.target.checked)} />{t('I agree to share my current location with the organizer and their invited family member while this visit or delivery is active.')}</label><p className="text-sm text-muted-foreground">{t('Keep this page open and your phone unlocked. Background tracking is not available. Only your latest location is stored.')}</p><Button variant="care" size="care" disabled={!consent} onClick={start}><Navigation />{t('Start sharing location')}</Button></>}
      {active && (partner || organizer) && <Button variant="care" size="care" onClick={() => void stop()}><Square />{t('Stop and erase location')}</Button>}
    </>}
  </div>;
}
export function LiveTracking({booking}: {booking: Booking}) {
  const {t} = useT();
  const identity = useTrackingIdentity();
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [partner, setPartner] = useState('');
  const [viewer, setViewer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!identity || !open) return;
    void supabase.from('tracking_sessions').select('id').eq('booking_id', booking.id).maybeSingle().then(({data, error}) => { if (error) toast.error(error.message); setId(data?.id ?? ''); });
  }, [identity?.id, open, booking.id]);
  useEffect(() => {
    if (canTrackBooking(booking) || !id || !identity) return;
    void supabase.rpc('stop_tracking', {_id: id});
  }, [booking.status, id, identity?.id]);
  if (!canTrackBooking(booking)) return null;
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const {data, error} = await supabase.rpc('create_tracking', {_booking: booking.id, _service: booking.type, _partner: partner.trim(), _viewer: viewer.trim() || undefined});
    setBusy(false);
    if (error) toast.error(error.message); else if (data) setId(data);
  };
  return <div className="mt-4"><Button variant="care" size="care" onClick={() => setOpen(!open)} aria-expanded={open}><MapPin />{t('Track real partner location')}</Button>{open && <div className="mt-3 space-y-3">{!identity ? <p>{t('Real tracking needs an email account; demo phone accounts cannot share private locations.')}</p> : id ? <><TrackingSession sessionId={id} /><div className="flex flex-wrap gap-2"><Link to="/tracking" search={{session: id}} className="btn btn-outline">{t('Open tracking page')}</Link><Button variant="care" size="care" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/tracking?session=${id}`).then(() => toast.success(t('Tracking link copied.'))).catch(() => toast.error(t('Could not copy. Open the tracking page and share its address.'))); }}><Copy />{t('Copy private tracking link')}</Button></div></> : <form onSubmit={e => void create(e)} className="space-y-3"><label className="block font-bold">{t('Assigned partner email')}<input type="email" required className="field" value={partner} onChange={e => setPartner(e.target.value)} /></label><label className="block font-bold">{t('Family viewer email (optional)')}<input type="email" className="field" value={viewer} onChange={e => setViewer(e.target.value)} /></label><p className="text-sm text-muted-foreground">{t('Share the private link with the assigned coach or delivery partner. They must sign in with this exact email. The link alone grants no access. Never enter a stranger’s email.')}</p><Button variant="care" size="care" type="submit" disabled={busy}>{t(busy ? 'Connecting…' : 'Create private tracking')}</Button></form>}</div>}</div>;
}