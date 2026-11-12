import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/seed";

export function TermsConsent({ role, busy, onAccept, onBack }: { role: Role; busy?: boolean; onAccept: () => void; onBack: () => void }) {
  const items = [
    ["terms", "I have read and agree to the WellNest Terms & Conditions."],
    ...(role === "senior"
      ? [["health", "I consent to WellNest storing my health information and any medical records I upload, only to suggest suitable meals and sessions."], ["withdraw", "I understand I can withdraw consent, delete my health data, or delete my account at any time."]]
      : [["privacy", "I will only view a senior’s bookings after they share their mobile number with me, and I respect their privacy."]]),
  ] as const;
  const [ok, setOk] = useState<Record<string, boolean>>({});
  return (
    <>
      <ShieldCheck className="h-10 w-10 text-primary" />
      <h2 className="mt-2 text-2xl font-bold">Terms & consent</h2>
      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border-2 p-4 text-base" tabIndex={0} aria-label="Terms and conditions">
        <p className="font-bold">1. Our service</p><p>WellNest connects you with verified fitness coaches, partner kitchens and pharmacies. Partners deliver the services; WellNest helps you book and track them.</p>
        <p className="mt-3 font-bold">2. Your data (DPDP Act, 2023)</p><p>We collect only what is needed: your contact details, and for seniors, health conditions, food preference, mobility and optional medical records. Health data is used only to filter meals and sessions. Partners see only what they need to serve you.</p>
        <p className="mt-3 font-bold">3. Family access</p><p>Family members you link can see your bookings and receive alerts. You can remove their access anytime from your Profile.</p>
        <p className="mt-3 font-bold">4. Payments & cancellations</p><p>Payments are made by UPI. Bookings can be cancelled free of charge up to 2 hours before the slot.</p>
        <p className="mt-3 font-bold">5. Not medical advice</p><p>Suggestions are guidance only. Always follow your doctor’s advice.</p>
        <p className="mt-3 font-bold">6. Your rights</p><p>You can correct your details, withdraw consent, delete your health data, or delete your account at any time from your Profile.</p>
      </div>
      {items.map(([k, t]) => (
        <label key={k} className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-lg">
          <input type="checkbox" className="mt-1 h-6 w-6 accent-[var(--primary)]" checked={!!ok[k]} onChange={(e) => setOk({ ...ok, [k]: e.target.checked })} />{t}
        </label>
      ))}
      <Button variant="care" size="care" className="btn btn-primary mt-5 w-full" disabled={busy || !items.every(([k]) => ok[k])} onClick={onAccept}>{role === "senior" ? "I agree — continue" : busy ? "Creating account…" : "I agree — create account"}</Button>
      <Button variant="care" size="care" className="mt-3 w-full font-semibold text-primary underline" onClick={onBack}>Back</Button>
    </>
  );
}
