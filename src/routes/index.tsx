import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { DEMO_OTP, type Role } from "@/lib/seed";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "WellNest — Sign in | Care that comes home" },
      { name: "description", content: "Sign in with your phone to book fitness coaches, health-suitable meals and medicine delivery." },
      { property: "og:title", content: "WellNest — Care that comes home" },
      { property: "og:description", content: "Senior care services at home, with family kept in the loop." },
    ],
  }),
  component: Login,
});

const DEMOS = [
  { phone: "9876543210", label: "Senior · Kamala" },
  { phone: "9123456789", label: "Family · Arjun" },
  { phone: "9999999999", label: "Admin" },
];

function Login() {
  const { ready, me, login, register } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<"id" | "otp" | "new">("id");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<Role>("senior");

  useEffect(() => {
    if (ready && me) nav({ to: me.role === "admin" ? "/admin" : me.role === "senior" && !me.health ? "/onboarding" : me.role === "family" && !me.linkedSeniorIds.length ? "/family" : "/home" });
  }, [ready, me, nav]);

  const target = method === "phone" ? `+91 ${phone}` : email.trim();
  const reset = (m: typeof mode) => { setMode(m); setStep("id"); setOtp(""); };
  const sendOtp = () => {
    if (method === "phone" && !/^\d{10}$/.test(phone)) return toast.error("Please enter a 10-digit mobile number");
    if (method === "email" && !/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Please enter a valid email address");
    toast.success(`Demo OTP sent to ${target}: ${DEMO_OTP}. No real ${method === "phone" ? "SMS" : "email"} is sent.`);
    setStep("otp");
  };
  const verify = () => {
    if (otp !== DEMO_OTP) return toast.error("That code is not correct. Try 123456.");
    const found = login(method === "phone" ? phone : email);
    if (found) { if (mode === "register") toast.info("You already have an account, so we signed you in."); return; }
    setStep("new");
  };
  const finish = () => {
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())) return toast.error("Username: 3–20 letters, numbers, _ or .");
    const n = age ? Number(age) : undefined;
    if (n !== undefined && (n < 18 || n > 120)) return toast.error("Please enter a valid age.");
    try {
      register(method === "phone" ? phone : "", name.trim(), role, { username, email: method === "email" ? email : undefined, age: n, city });
      toast.success("Account created. Welcome to WellNest!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not register."); }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src={hero} alt="A grandmother doing gentle chair yoga at home" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="flex flex-col justify-center px-6 py-10 md:px-14">
        <Logo />
        <h1 className="mt-10 text-4xl font-bold leading-tight md:text-5xl">Care that comes home.</h1>
        <p className="mt-3 text-lg text-muted-foreground">Gentle fitness, meals that suit your health, and medicines at your door — with your family kept informed.</p>

        <div className="surface mt-8 p-6">
          {step === "id" && (
            <div className="mb-5 grid grid-cols-2 gap-2" role="tablist">
              <Button variant="care" size="care" role="tab" aria-selected={mode === "signin"} className={`btn ${mode === "signin" ? "btn-primary" : "btn-outline"}`} onClick={() => reset("signin")}>Sign in</Button>
              <Button variant="care" size="care" role="tab" aria-selected={mode === "register"} className={`btn ${mode === "register" ? "btn-primary" : "btn-outline"}`} onClick={() => reset("register")}>Register</Button>
            </div>
          )}
          {step === "id" && (
            <>
              <p className="mb-2 text-lg font-bold">{mode === "register" ? "Create your account with" : "Sign in with"}</p>
              <div className="mb-4 flex gap-2">
                <Button variant="care" size="care" className="chip" aria-pressed={method === "phone"} onClick={() => setMethod("phone")}>Mobile number</Button>
                <Button variant="care" size="care" className="chip" aria-pressed={method === "email"} onClick={() => setMethod("email")}>Email</Button>
              </div>
              {method === "phone" ? (
                <>
                  <label htmlFor="phone" className="mb-2 block text-lg font-bold">Mobile number</label>
                  <div className="flex gap-2">
                    <span className="field flex w-auto items-center font-bold">+91</span>
                    <input id="phone" inputMode="numeric" maxLength={10} className="field text-xl tracking-wider" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="email" className="mb-2 block text-lg font-bold">Email address</label>
                  <input id="email" type="email" className="field text-xl" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </>
              )}
              <Button variant="care" size="care" className="btn btn-primary mt-4 w-full" disabled={!ready} onClick={sendOtp}>Send OTP</Button>
              {mode === "signin" && (
                <>
                  <p className="mt-5 text-sm font-bold text-muted-foreground">Try a demo account:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DEMOS.map((d) => <Button variant="care" size="care" key={d.phone} className="chip text-sm" onClick={() => { setMethod("phone"); setPhone(d.phone); }}>{d.label}</Button>)}
                  </div>
                </>
              )}
            </>
          )}
          {step === "otp" && (
            <>
              <label htmlFor="otp" className="mb-2 block text-lg font-bold">Enter the 6-digit code sent to {target}</label>
              <input id="otp" inputMode="numeric" maxLength={6} autoFocus className="field text-center text-3xl tracking-[0.5em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              <p className="mt-2 text-muted-foreground">Demo code: <strong>{DEMO_OTP}</strong></p>
              <Button variant="care" size="care" className="btn btn-primary mt-4 w-full" onClick={verify} disabled={otp.length !== 6}>Verify & continue</Button>
              <Button variant="care" size="care" className="mt-3 w-full font-semibold text-primary underline" onClick={() => { setStep("id"); setOtp(""); }}>Change {method === "phone" ? "number" : "email"}</Button>
            </>
          )}
          {step === "new" && (
            <>
              <h2 className="text-2xl font-bold">Welcome! Tell us about you</h2>
              <p className="text-muted-foreground">Verified: {target}</p>
              <label htmlFor="name" className="mb-2 mt-4 block font-bold">Full name</label>
              <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
              <label htmlFor="username" className="mb-2 mt-4 block font-bold">Username</label>
              <input id="username" className="field" placeholder="e.g. kamala_r" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><label htmlFor="age" className="mb-2 block font-bold">Age (optional)</label><input id="age" inputMode="numeric" maxLength={3} className="field" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} /></div>
                <div><label htmlFor="city" className="mb-2 block font-bold">City (optional)</label><input id="city" className="field" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              </div>
              <p className="mb-2 mt-4 font-bold">I am a…</p>
              <div className="grid gap-2">
                {([["senior", "Senior citizen", "Book services for myself", HeartHandshake], ["family", "Family member", "Look after a parent or relative", Users], ["admin", "Administrator", "Verify partners & review orders", ShieldCheck]] as const).map(([r, t, s, Icon]) => (
                  <Button variant="care" size="care" key={r} onClick={() => setRole(r)} aria-pressed={role === r} className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left ${role === r ? "border-primary bg-secondary" : "bg-card"}`}>
                    <Icon className="h-8 w-8 text-primary" /><span><strong className="block text-lg">{t}</strong><span className="text-muted-foreground">{s}</span></span>
                  </Button>
                ))}
              </div>
              <Button variant="care" size="care" className="btn btn-primary mt-5 w-full" disabled={name.trim().length < 2 || username.trim().length < 3} onClick={finish}>Create account</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
