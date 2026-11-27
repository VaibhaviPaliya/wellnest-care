import { useState } from 'react';
import { CheckField } from "@/components/CheckField";
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Check, Play, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { UpiCheckout } from '@/components/Shell';
import { PlanModeration } from './PlanModeration';
import { ExercisePlans } from './ExercisePlans';
import { MyPacks } from './Packs';
import { useStore } from '@/lib/store';
import { EXERCISE_SUBSCRIPTION, calorieTarget, hasActiveSubscription, type Metrics, type ExercisePlan } from '@/lib/care';
import type { Booking } from '@/lib/seed';

export function MetricsFields({ value, onChange }: { value?: Metrics; onChange: (m: Metrics | undefined) => void }) {
  const [enabled, setEnabled] = useState(!!value);
  const m = value ?? { age: 65, height: 160, weight: 60, sex: 'female', activity: 'sedentary' };
  const target = value ? calorieTarget(value) : null;
  return <fieldset className="space-y-3"><legend className="text-base font-bold">Calorie estimate (optional)</legend>
    <CheckField checked={enabled} onChange={(v) => { setEnabled(v); onChange(v ? m : undefined); }}>Add measurements for a maintenance estimate</CheckField>
    {enabled && <><div className="grid gap-3 sm:grid-cols-3">{([['age', 'Age (years)'], ['height', 'Height (cm)'], ['weight', 'Weight (kg)']] as const).map(([key, label]) => <label key={key} className="font-bold">{label}<input className="field" type="number" step={key === 'age' ? '1' : '0.1'} value={m[key] || ''} onChange={e => onChange({ ...m, [key]: Number(e.target.value) })} /></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="font-bold">Sex used in formula<select className="field" value={m.sex} onChange={e => onChange({ ...m, sex: e.target.value as Metrics['sex'] })}><option value="female">Female</option><option value="male">Male</option></select></label><label className="font-bold">Activity level<select className="field" value={m.activity} onChange={e => onChange({ ...m, activity: e.target.value as Metrics['activity'] })}><option value="sedentary">Mostly seated</option><option value="light">Light activity</option><option value="moderate">Moderate activity</option></select></label></div>
      <p className="font-bold">{target ? `${target} kcal / day — estimated maintenance` : 'Enter valid measurements to calculate.'}</p><p className="text-sm text-muted-foreground">Mifflin–St Jeor estimate, not a treatment target. A dietitian must review medical diets, frailty, weight changes and prescription restrictions.</p></>}
  </fieldset>;
}

export function FitnessExtras() {
  const { senior, requestCare } = useStore();
  const [therapy, setTherapy] = useState('');
  if (!senior?.consent?.given) return null;
  return <section className="my-6 space-y-5 border-y py-6">
    <ExercisePlans />
    <MyPacks />
    <div><h3 className="text-base font-semibold">Therapy massage · home visit</h3><p className="text-muted-foreground">Professional approval required before scheduling or payment. Demo requests do not book a therapist.</p><label className="mt-3 block font-bold">Goals, preferred date and relevant clinician advice<textarea className="field mt-1" rows={2} maxLength={2000} value={therapy} onChange={e => setTherapy(e.target.value)} /></label><Button variant="care" size="care" className="btn btn-outline mt-3" disabled={!therapy.trim()} onClick={() => { const error = requestCare('therapy', therapy); if (error) toast.error(error); else { setTherapy(''); toast.success('Sent for professional review.'); } }}>Request therapy review</Button><RequestList kind="therapy" /></div>
  </section>;
}

export function RequestList({ kind }: { kind: 'therapy' | 'meal' }) {
  const { db, senior } = useStore();
  return <ul className="mt-3 divide-y">{db.care.requests.filter(r => r.seniorId === senior?.id && r.kind === kind).map(r => <li className="py-3" key={r.id}><span className="tag capitalize">{r.status} · demo review</span><p>{r.detail}</p>{r.professional && <p className="text-sm text-muted-foreground">{r.professional} · {r.decision}</p>}</li>)}</ul>;
}

export function MealExtras() {
  const { db, senior, requestCare } = useStore();
  const [partner, setPartner] = useState(db.kitchens.find(k => k.verified && k.customizes)?.id ?? '');
  const [detail, setDetail] = useState('');
  if (!senior?.health || !senior.consent?.given) return null;
  const target = senior.health.metrics ? calorieTarget(senior.health.metrics) : null;
  return <section className="mb-6 space-y-3 border-y py-5"><h2 className="text-lg font-bold">Nutrition & tailored meals</h2><p className="font-bold">{target ? `${target} kcal/day · estimated maintenance` : 'Add your measurements to calculate a calorie estimate.'}</p><Link to="/profile" className="text-primary underline">Update nutrition measurements</Link><p className="text-sm text-muted-foreground">Prescriptions are not automatically interpreted. A dietitian must review medical restrictions before any meal changes; existing health filters always apply.</p><details><summary className="cursor-pointer text-base font-bold">Request a customized dabba or restaurant meal</summary><div className="mt-3 space-y-3"><label className="block font-bold">Kitchen or restaurant<select className="field" value={partner} onChange={e => setPartner(e.target.value)}>{db.kitchens.filter(k => k.verified && k.customizes).map(k => <option value={k.id} key={k.id}>{k.name} · {k.kind === 'dabba' ? 'Local dabba' : 'Restaurant'} · {k.area}</option>)}</select></label><label className="block font-bold">Dietary changes and prescription instructions<textarea className="field" rows={3} value={detail} maxLength={2000} onChange={e => setDetail(e.target.value)} /></label><p className="text-sm text-muted-foreground">Share past records through your health profile. No medical changes or orders are made by submitting this request.</p><Button variant="care" size="care" className="btn btn-outline" disabled={!detail.trim()} onClick={() => { const error = requestCare('meal', detail, partner); if (error) toast.error(error); else { setDetail(''); toast.success('Customization sent for professional review.'); } }}>Request meal review</Button></div></details><RequestList kind="meal" /></section>;
}

export function DemoTracking({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const progress = booking.status === 'completed' ? 3 : booking.status === 'out_for_delivery' ? 2 : booking.status === 'in_progress' ? 1 : 0;
  if (booking.status === 'cancelled') return null;
  return <div className="mt-4"><Button variant="care" size="care" className="btn btn-outline" onClick={() => setOpen(!open)} aria-expanded={open}><MapPin className="h-5 w-5" />{open ? 'Hide' : 'Show'} demo location</Button>{open && <div className="mt-3 space-y-2"><p className="font-bold">Simulated map · not a real location</p><svg viewBox="0 0 480 180" className="h-48 w-full rounded-lg border bg-muted" role="img" aria-label="Demonstration route from partner to home"><path d="M20 30H460 M20 90H460 M20 150H460 M80 10V170 M220 10V170 M360 10V170" className="stroke-border" fill="none" strokeWidth="12" /><path d="M65 130 L180 130 L180 50 L410 50" className="stroke-primary" fill="none" strokeWidth="5" strokeDasharray="8 5" /><circle cx="65" cy="130" r="10" className="fill-accent" /><circle cx="410" cy="50" r="10" className="fill-success" /><circle cx={[65,180,300,410][progress]} cy={progress < 2 ? 130 : 50} r="12" className="fill-primary stroke-card" strokeWidth="3" /><text x="35" y="165" className="fill-foreground" fontSize="15">Partner</text><text x="390" y="30" className="fill-foreground" fontSize="15">Home</text></svg><p className="text-sm text-muted-foreground">{booking.type === 'fitness' ? (booking.status === 'in_progress' ? 'Session in progress' : booking.status === 'completed' ? 'Session completed' : 'Coach visit scheduled') : 'Delivery progress'} · location changes only with simulated status updates. Family sees the same progress in this browser's demo data.</p></div>}</div>;
}

export function CareAdmin() {
  const { db, saveExercisePlan, decideCare, saveDishNutrition } = useStore();
  const [plan, setPlan] = useState<ExercisePlan>(() => db.care.plans[0] ?? { id: 'plan-new', coachId: db.coaches[0]?.id ?? '', name: '', days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => ({ day, title: '', minutes: 10 })) });
  const [professional, setProfessional] = useState('');
  const [decision, setDecision] = useState('');
  const [dishId, setDishId] = useState(db.dishes[0]?.id ?? '');
  const [nutrition, setNutrition] = useState({ calories: 0, carbs: 0, protein: 0 });
  const report = (error: string | null) => error ? toast.error(error) : toast.success('Saved in demo data.');
  return <div className="space-y-8"><PlanModeration />
    <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-bold">Menu management · demo partner view</h2><p className="text-muted-foreground">Nutrition per serving must come from the kitchen. Unprovided nutrition stays unknown; no values are invented.</p><label className="block font-bold">Dish<select className="field" value={dishId} onChange={e => { setDishId(e.target.value); setNutrition(db.dishes.find(d => d.id === e.target.value)?.nutrition ?? { calories: 0, carbs: 0, protein: 0 }); }}>{db.dishes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-3">{(['calories','carbs','protein'] as const).map(key => <label className="font-bold capitalize" key={key}>{key} ({key === 'calories' ? 'kcal' : 'g'})<input className="field" type="number" min={0} value={nutrition[key]} onChange={e => setNutrition({ ...nutrition, [key]: Number(e.target.value) })} /></label>)}</div><Button variant="care" size="care" className="btn btn-primary" onClick={() => report(saveDishNutrition(dishId, nutrition))}>Save serving nutrition</Button></section>
    <section className="space-y-3 border-t pt-6"><h2 className="text-lg font-bold">Professional review requests</h2><p className="text-muted-foreground">Record a dietitian or therapist decision for demonstration only. An administrator is not automatically a clinician.</p><label className="block font-bold">Reviewing professional<input className="field" value={professional} onChange={e => setProfessional(e.target.value)} /></label><label className="block font-bold">Professional decision / instructions<textarea className="field" value={decision} onChange={e => setDecision(e.target.value)} /></label><ul className="divide-y">{db.care.requests.map(r => <li className="py-4" key={r.id}><p className="font-bold">{r.kind === 'therapy' ? 'Therapy massage' : 'Meal customization'} · {db.users.find(u => u.id === r.seniorId)?.name} · {r.status}</p><p>{r.detail}</p>{r.status === 'pending' ? <div className="mt-3 flex flex-wrap gap-3"><Button variant="care" size="care" className="btn btn-primary" onClick={() => report(decideCare(r.id, true, professional, decision))}>Record approval</Button><Button variant="care" size="care" className="btn btn-outline" onClick={() => report(decideCare(r.id, false, professional, decision))}>Record rejection</Button></div> : <p>{r.professional} · {r.decision}</p>}</li>)}</ul>{!db.care.requests.length && <p>No requests awaiting review.</p>}</section></div>;
}