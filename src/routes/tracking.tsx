import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Shell';
import { TrackingSession, useTrackingIdentity } from '@/components/LiveTracking';
import { supabase } from '@/integrations/supabase/client';
import { useT } from '@/lib/i18n';

export const Route = createFileRoute('/tracking')({
  validateSearch: (search: Record<string, unknown>): {session: string} => ({session: typeof search['session'] === 'string' && /^[0-9a-f-]{36}$/i.test(search['session']) ? search['session'] : ''}),
  head: () => ({meta: [
    {title: 'Private Partner Tracking | WellNest'},
    {name: 'description', content: 'Private phone location sharing for WellNest medicine deliveries, meals and home-visit coaches.'},
    {property: 'og:title', content: 'Private Partner Tracking | WellNest'},
    {property: 'og:description', content: 'Securely view or share a partner location during a delivery or visit.'},
    {property: 'og:type', content: 'website'}, {name: 'twitter:card', content: 'summary'},
  ]}),
  component: TrackingPage,
});
function TrackingPage() {
  const {session} = Route.useSearch();
  const identity = useTrackingIdentity();
  const {t} = useT();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    const {error: problem} = sent ? await supabase.auth.verifyOtp({email: email.trim(), token: code.trim(), type: 'email'}) : await supabase.auth.signInWithOtp({email: email.trim(), options: {emailRedirectTo: `${window.location.origin}/tracking?session=${session}`}});
    setBusy(false); if (problem) setError(problem.message); else setSent(true);
  };
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-8"><Logo /><h1 className="text-2xl font-bold">{t('Private partner tracking')}</h1>{!session ? <p>{t('Open the private tracking link sent by the organizer.')}</p> : identity ? <><p>{identity.email}</p><TrackingSession sessionId={session} /><Button variant="care" size="care" onClick={() => void supabase.auth.signOut()}>{t('Log out')}</Button></> : <form className="space-y-4" onSubmit={event => void submit(event)}><p>{t('Sign in using the email invited by the organizer.')}</p><label className="block font-bold">{t('Email')}<input type="email" autoComplete="email" className="field" required value={email} disabled={sent} onChange={e => setEmail(e.target.value)} /></label>{sent && <label className="block font-bold">{t('Email approval code')}<input autoComplete="one-time-code" inputMode="numeric" className="field" required value={code} onChange={e => setCode(e.target.value)} /></label>}{error && <p role="alert" className="text-destructive">{error}</p>}<Button variant="care" size="care" type="submit" disabled={busy}>{t(busy ? 'Connecting…' : sent ? 'Verify code' : 'Send email code')}</Button>{sent && <Button variant="care" size="care" onClick={() => {setSent(false); setCode('');}}>{t('Change email or resend')}</Button>}</form>}<Link to="/" className="block text-primary underline">{t('Back to WellNest')}</Link></main>;
}