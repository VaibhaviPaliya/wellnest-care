import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { PageTitle, Shell, fmtWhen } from "@/components/Shell";
import { HealthForm } from "@/components/HealthForm";
import { useStore } from "@/lib/store";
import { SyncSettings } from '@/components/SyncSettings';
import { supabase } from "@/integrations/supabase/client";
import { deleteMyCloudAccount } from "@/lib/account.functions";
import { DEMO_OTP } from "@/lib/seed";
import type { User } from "@/lib/seed";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "My Profile & Privacy | WellNest" },
      { name: "description", content: "Update your health profile, see who can view your data, and delete health data anytime." },
      { property: "og:title", content: "My Profile & Privacy | WellNest" },
      { property: "og:description", content: "Control your health data on WellNest." },
    ],
  }),
  component: () => <Shell><Profile /></Shell>,
});

function Profile() {
  const { me, db, saveHealth, deleteHealthData, unlinkFamily } = useStore();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [revoke, setRevoke] = useState<string | null>(null);
  if (!me) return null;
  const family = db.users.filter((u) => u.linkedSeniorIds.includes(me.id));
  const sub = [me.username && `@${me.username}`, me.phone && `+91 ${me.phone}`, me.email].filter(Boolean).join(" · ");
  if (me.role !== "senior") return (
    <>
      <PageTitle title="My Profile" sub={sub} back={me.role !== "admin"} />
      <div className="surface max-w-2xl p-6"><DetailsForm me={me} /></div>
      {me.role === "family" && <div className="mt-6 max-w-2xl"><SyncSettings /></div>}
      <DeleteAccount me={me} />
    </>
  );
  return (
    <>
      <PageTitle title="My Profile" sub={sub} />
      <div className="surface mb-6 p-6"><DetailsForm me={me} /></div>
      <div className="mb-6"><SyncSettings /></div>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="surface p-6">
          <h2 className="text-2xl font-bold">Health profile</h2>
          <HealthForm initial={me.health} initialAddress={me.address} submitLabel="Save changes" onSubmit={(h, a) => { saveHealth(h, a); toast.success("Saved. Meal suggestions updated."); }} />
        </div>
        <div className="space-y-6">
          <div className="surface p-5">
            <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-6 w-6 text-success" />Consent</h2>
            <p className="mt-1">Given on {me.consent ? fmtWhen(me.consent.at) : "—"}</p>
            <p className="mt-3 font-bold">Family who can see your bookings</p>
            <ul className="mt-1 space-y-3">{family.length ? family.map((f) => <li key={f.id}><p>{f.name}</p>{revoke === f.id ? <div className="flex flex-wrap gap-2"><Button variant="care" size="care" className="btn btn-outline min-h-11 text-base" onClick={() => setRevoke(null)}>Keep access</Button><Button variant="care" size="care" className="btn btn-danger min-h-11 text-base" onClick={() => { unlinkFamily(f.id); setRevoke(null); toast.success("Family access removed."); }}>Confirm removal</Button></div> : <Button variant="care" size="care" className="text-destructive underline" onClick={() => setRevoke(f.id)}>Remove access</Button>}</li>) : <li>No one yet</li>}</ul>
          </div>
          <div className="surface border-destructive p-5">
            <h2 className="text-xl font-bold">Delete health data</h2>
            <p className="mt-1">This erases your conditions, allergies, diet, mobility and prescription attachments, and withdraws consent. Booking history and your delivery address stay.</p>
            {confirm ? (
              <div className="mt-3 flex gap-2">
                <Button variant="care" size="care" className="btn btn-outline flex-1" onClick={() => setConfirm(false)}>Keep</Button>
                <Button variant="care" size="care" className="btn btn-danger flex-1" onClick={() => { deleteHealthData(); toast.success("Health data deleted."); nav({ to: "/onboarding" }); }}>Yes, delete</Button>
              </div>
            ) : <Button variant="care" size="care" className="btn btn-danger mt-3 w-full" onClick={() => setConfirm(true)}><Trash2 className="h-5 w-5" />Delete my health data</Button>}
          </div>
        </div>
      </div>
      <DeleteAccount me={me} />
    </>
  );
}

function DeleteAccount({ me }: { me: User }) {
  const { deleteAccount } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState(false);
  const start = async () => {
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const isCloud = data.user?.id === me.id && !!me.email;
    setCloud(isCloud);
    if (isCloud) {
      const { error } = await supabase.auth.signInWithOtp({ email: me.email!, options: { shouldCreateUser: false } });
      setBusy(false);
      if (error) return toast.error("Could not send the approval code. Please try again in a minute.");
      toast.success(`Approval code emailed to ${me.email}.`);
    } else { setBusy(false); toast.success(`Demo approval code sent to +91 ${me.phone}: ${DEMO_OTP}`); }
    setStep("code");
  };
  const confirm = async () => {
    setBusy(true);
    try {
      if (cloud) {
        const { error } = await supabase.auth.verifyOtp({ email: me.email!, token: code, type: "email" });
        if (error) throw new Error("That approval code is not correct or has expired.");
        await deleteMyCloudAccount();
      } else if (code !== DEMO_OTP) throw new Error("That approval code is not correct.");
      const err = deleteAccount();
      if (err) throw new Error(err);
      toast.success("Your account has been deleted.");
      nav({ to: "/" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete the account."); }
    setBusy(false);
  };
  return (
    <div className="surface mt-6 max-w-2xl border-destructive p-6">
      <h2 className="text-xl font-bold">Delete my account</h2>
      <p className="mt-1">This permanently removes your account{me.role === "senior" ? ", health data, records, bookings and family links" : " and your alerts"}. It cannot be undone.</p>
      {step === "idle" ? (
        <Button variant="care" size="care" className="btn btn-danger mt-3 w-full sm:w-auto" disabled={busy} onClick={start}><Trash2 className="h-5 w-5" />Delete my account</Button>
      ) : (
        <div className="mt-3">
          <label htmlFor="del-code" className="mb-2 block font-bold">Enter the approval code sent to {cloud ? me.email : `+91 ${me.phone}`}</label>
          <input id="del-code" inputMode="numeric" maxLength={8} className="field text-center text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <div className="mt-3 flex gap-2">
            <Button variant="care" size="care" className="btn btn-outline flex-1" onClick={() => { setStep("idle"); setCode(""); }}>Keep account</Button>
            <Button variant="care" size="care" className="btn btn-danger flex-1" disabled={busy || code.length < 6} onClick={confirm}>Delete permanently</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsForm({ me }: { me: User }) {
  const { updateProfile } = useStore();
  const [f, setF] = useState({ name: me.name, username: me.username ?? "", email: me.email ?? "", phone: me.phone ?? "", age: me.age ? String(me.age) : "", city: me.city ?? "" });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const err = updateProfile({ name: f.name, username: f.username, email: f.email, phone: f.phone, age: f.age ? Number(f.age) : undefined, city: f.city });
    if (err) toast.error(err); else toast.success("Profile details saved.");
  };
  const field = (k: keyof typeof f, label: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label htmlFor={`pf-${k}`} className="mb-1 block font-bold">{label}</label><input id={`pf-${k}`} className="field" value={f[k]} onChange={set(k)} {...extra} /></div>
  );
  return (
    <>
      <h2 className="text-2xl font-bold">Profile details</h2>
      <p className="mb-4 text-muted-foreground">Role: {me.role === "senior" ? "Senior citizen" : me.role === "family" ? "Family member" : "Administrator"}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Full name")}
        {field("username", "Username")}
        {field("phone", "Mobile number", { inputMode: "numeric", maxLength: 10 })}
        {field("email", "Email", { type: "email" })}
        {field("age", "Age", { inputMode: "numeric", maxLength: 3 })}
        {field("city", "City")}
      </div>
      <Button variant="care" size="care" className="btn btn-primary mt-5 w-full sm:w-auto" onClick={save}>Save details</Button>
    </>
  );
}
