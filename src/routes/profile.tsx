import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { PageTitle, Shell, fmtWhen } from "@/components/Shell";
import { HealthForm } from "@/components/HealthForm";
import { useStore } from "@/lib/store";
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
    </>
  );
  return (
    <>
      <PageTitle title="My Profile" sub={sub} />
      <div className="surface mb-6 p-6"><DetailsForm me={me} /></div>
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
    </>
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
