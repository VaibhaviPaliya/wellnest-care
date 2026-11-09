import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Link2, UserRound } from "lucide-react";
import { PageTitle, Shell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { CONDITION_LABEL, DEMO_OTP } from "@/lib/seed";
import { HealthForm } from "@/components/HealthForm";

export const Route = createFileRoute("/family")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Family Linking | WellNest" },
      { name: "description", content: "Link to your parent’s WellNest account to monitor bookings and receive alerts." },
      { property: "og:title", content: "Family Linking | WellNest" },
      { property: "og:description", content: "Stay connected to your loved one’s care." },
    ],
  }),
  component: () => <Shell roles={["family"]}><Family /></Shell>,
});

function Family() {
  const { db, me, senior, linkSenior, setActiveSenior, saveHealth } = useStore();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const linked = db.users.filter((u) => me?.linkedSeniorIds.includes(u.id));
  const link = () => {
    if (otp !== DEMO_OTP) return toast.error("Wrong code. Demo code is 123456.");
    const err = linkSenior(phone);
    if (err) toast.error(err); else { toast.success("Linked! You’ll now get their alerts."); setPhone(""); setOtp(""); setSent(false); }
  };
  return (
    <>
      <PageTitle title="Family" sub="Seniors you look after." back={linked.length > 0} />
      <ul className="grid gap-4 md:grid-cols-2">
        {linked.map((s) => (
          <li key={s.id} className={`surface p-5 ${senior?.id === s.id ? "border-primary" : ""}`}>
            <div className="flex items-center gap-3"><UserRound className="h-10 w-10 text-primary" /><div><h2 className="text-xl font-bold">{s.name}</h2><p className="text-muted-foreground">+91 {s.phone}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-1">{s.health?.conditions.map((c) => <span key={c} className="tag">{CONDITION_LABEL[c]}</span>) ?? <span className="text-muted-foreground">Health data not shared</span>}</div>
            {senior?.id === s.id ? <p className="mt-3 font-bold text-success">Currently managing</p> : <Button variant="care" size="care" className="btn btn-outline mt-3" onClick={() => setActiveSenior(s.id)}>Manage {s.name.split(" ")[0]}</Button>}
          </li>
        ))}
      </ul>
      {senior?.consent?.given && <section className="mt-6 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{senior.name.split(" ")[0]}’s health profile</h2><Button variant="care" size="care" className="btn btn-outline" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Edit profile"}</Button></div>
        {editing && <HealthForm key={senior.id} initial={senior.health} initialAddress={senior.address} submitLabel="Save profile" onSubmit={(health, address) => { saveHealth(health, address); setEditing(false); toast.success("Profile updated for your senior."); }} />}
      </section>}
      <div className="surface mt-6 max-w-xl p-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Link2 className="h-6 w-6" />Link a senior</h2>
        <p className="mt-1 text-muted-foreground">Demo approval uses code {DEMO_OTP}; no SMS is sent. Try 9876500001.</p>
        <label htmlFor="sp" className="mb-1 mt-4 block font-bold">Senior’s mobile number</label>
        <input id="sp" className="field" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); setSent(false); setOtp(""); }} />
        {sent && (<>
          <label htmlFor="so" className="mb-1 mt-4 block font-bold">Code from their phone (demo: {DEMO_OTP})</label>
          <input id="so" className="field" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
        </>)}
        <Button variant="care" size="care" className="btn btn-primary mt-4 w-full" disabled={phone.length !== 10} onClick={() => (sent ? link() : (setSent(true), toast.success(`Approval code sent. Demo: ${DEMO_OTP}`)))}>{sent ? "Link account" : "Send approval code"}</Button>
      </div>
    </>
  );
}
