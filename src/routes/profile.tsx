import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { PageTitle, Shell, fmtWhen } from "@/components/Shell";
import { HealthForm } from "@/components/HealthForm";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile & Privacy | WellNest" },
      { name: "description", content: "Update your health profile, see who can view your data, and delete health data anytime." },
      { property: "og:title", content: "My Profile & Privacy | WellNest" },
      { property: "og:description", content: "Control your health data on WellNest." },
    ],
  }),
  component: () => <Shell roles={["senior"]}><Profile /></Shell>,
});

function Profile() {
  const { me, db, saveHealth, deleteHealthData } = useStore();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const family = db.users.filter((u) => u.linkedSeniorIds.includes(me!.id));
  return (
    <>
      <PageTitle title="My Profile" sub={`${me!.name} · +91 ${me!.phone}`} />
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="surface p-6">
          <h2 className="text-2xl font-bold">Health profile</h2>
          <HealthForm initial={me!.health} initialAddress={me!.address} submitLabel="Save changes" onSubmit={(h, a) => { saveHealth(h, a); toast.success("Saved. Meal suggestions updated."); }} />
        </div>
        <div className="space-y-6">
          <div className="surface p-5">
            <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-6 w-6 text-success" />Consent</h2>
            <p className="mt-1">Given on {me!.consent ? fmtWhen(me!.consent.at) : "—"}</p>
            <p className="mt-3 font-bold">Family who can see your bookings</p>
            <ul className="mt-1 list-disc pl-5">{family.length ? family.map((f) => <li key={f.id}>{f.name}</li>) : <li>No one yet</li>}</ul>
          </div>
          <div className="surface border-destructive p-5">
            <h2 className="text-xl font-bold">Delete health data</h2>
            <p className="mt-1">This erases your conditions, diet and mobility, and withdraws consent. Bookings history stays.</p>
            {confirm ? (
              <div className="mt-3 flex gap-2">
                <button className="btn btn-outline flex-1" onClick={() => setConfirm(false)}>Keep</button>
                <button className="btn btn-danger flex-1" onClick={() => { deleteHealthData(); toast.success("Health data deleted."); nav({ to: "/onboarding" }); }}>Yes, delete</button>
              </div>
            ) : <button className="btn btn-danger mt-3 w-full" onClick={() => setConfirm(true)}><Trash2 className="h-5 w-5" />Delete my health data</button>}
          </div>
        </div>
      </div>
    </>
  );
}
