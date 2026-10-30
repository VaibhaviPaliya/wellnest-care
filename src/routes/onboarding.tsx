import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { HealthForm } from "@/components/HealthForm";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Consent & health profile | WellNest" },
      { name: "description", content: "Give consent and set up your health profile so WellNest can suggest suitable meals and sessions." },
      { property: "og:title", content: "Consent & health profile | WellNest" },
      { property: "og:description", content: "DPDP-compliant consent and health profile setup." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { ready, me, giveConsent, saveHealth } = useStore();
  const nav = useNavigate();
  const [agree, setAgree] = useState({ a: false, b: false });
  useEffect(() => {
    if (!ready) return;
    if (!me) nav({ to: "/" });
    else if (me.role !== "senior") nav({ to: "/" });
  }, [ready, me, nav]);
  if (!me) return null;
  const consented = !!me.consent?.given;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Logo />
      <p className="mt-8 font-bold text-accent">Step {consented ? 2 : 1} of 2</p>
      {!consented ? (
        <div className="surface mt-3 p-6 md:p-8">
          <ShieldCheck className="h-12 w-12 text-primary" />
          <h1 className="mt-3 text-3xl font-bold">Your consent comes first</h1>
          <p className="mt-3 text-lg">Before we store any health information, we need your permission under India’s <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong>.</p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-lg">
            <li>We use your health conditions only to suggest suitable meals and fitness sessions.</li>
            <li>Only you and family members <em>you</em> link can see your bookings.</li>
            <li>Partners see only what they need to deliver a service.</li>
            <li>You can <strong>delete your health data anytime</strong> from your Profile.</li>
          </ul>
          {([["a", "I agree to WellNest storing my health information for the purposes above."], ["b", "I understand I can withdraw consent and delete my data at any time."]] as const).map(([k, t]) => (
            <label key={k} className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-lg">
              <input type="checkbox" className="mt-1 h-6 w-6 accent-[var(--primary)]" checked={agree[k]} onChange={(e) => setAgree({ ...agree, [k]: e.target.checked })} />
              {t}
            </label>
          ))}
          <button className="btn btn-primary mt-6 w-full" disabled={!agree.a || !agree.b} onClick={giveConsent}>I give my consent</button>
        </div>
      ) : (
        <div className="surface mt-3 p-6 md:p-8">
          <h1 className="text-3xl font-bold">Your health profile</h1>
          <p className="mt-2 text-lg text-muted-foreground">This helps us show only meals and sessions that are right for you.</p>
          <HealthForm initial={me.health} initialAddress={me.address} submitLabel="Save & go to home" onSubmit={(h, addr) => { saveHealth(h, addr); nav({ to: "/home" }); }} />
        </div>
      )}
    </div>
  );
}
