import { useEffect, useState } from "react";
import { Bell, BadgeCheck, Dumbbell, Pill, Soup, Sparkles, Truck, Video } from "lucide-react";

/** Animated preview of the app for the sign-in page: three services, each with a family alert. */
const SCENES = [
  {
    key: "fitness", label: "Fitness", icon: Dumbbell,
    title: "Gentle fitness at home",
    sub: "Verified coaches for yoga, mobility and meditation — at home or online.",
    alert: "Arjun was told: Chair yoga booked for 5:00 pm",
  },
  {
    key: "meals", label: "Meals", icon: Soup,
    title: "Meals that suit your health",
    sub: "Only dishes that fit your conditions, each with “why this suits you”.",
    alert: "Arjun was told: Lunch is on its way",
  },
  {
    key: "meds", label: "Medicines", icon: Pill,
    title: "Medicines at your door",
    sub: "Upload a prescription, pick a slot, track a verified delivery partner.",
    alert: "Arjun was told: Medicines out for delivery",
  },
] as const;

function Avatar({ initials, hue }: { initials: string; hue: number }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: `hsl(${hue} 45% 42%)` }} aria-hidden>
      {initials}
    </span>
  );
}

function Screen({ scene }: { scene: number }) {
  if (scene === 0)
    return (
      <div className="space-y-2.5">
        <div className="rounded-xl border bg-white p-3">
          <div className="flex items-center gap-2.5">
            <Avatar initials="MN" hue={186} />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[13px] font-semibold">Meera Nair <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden /></p>
              <p className="text-[11px] text-muted-foreground">Chair yoga · Home visit · ★ 4.8</p>
            </div>
          </div>
          <p className="mt-2 rounded-lg bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">Arrives 4:50–5:00 pm</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border bg-white p-3 text-[12px]">
          <Video className="h-4 w-4 text-primary" aria-hidden /> Online class · <span className="font-semibold text-primary">Join</span>
        </div>
      </div>
    );
  if (scene === 1)
    return (
      <div className="rounded-xl border bg-white p-3">
        <p className="text-[13px] font-semibold">Oats porridge with almond milk</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {["Low sugar", "Low sodium", "Soft"].map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t}</span>)}
        </div>
        <div className="mt-2 rounded-lg bg-tile-fit p-2 text-[11px]">
          <p className="flex items-center gap-1 font-semibold"><Sparkles className="h-3 w-3 text-primary" aria-hidden /> Why this suits you</p>
          <p className="text-muted-foreground">Low sugar keeps blood sugar steady</p>
        </div>
        <div className="mt-2 flex items-center justify-between"><span className="text-[13px] font-bold">₹120</span><span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">Add</span></div>
      </div>
    );
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border bg-white p-3">
        <p className="text-[13px] font-semibold">Metformin 500 mg · Apollo</p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {[1, 1, 1, 0].map((on, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${on ? "bg-success" : "bg-muted"}`} />)}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Out for delivery</p>
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border bg-white p-3">
        <Avatar initials="RK" hue={350} />
        <div className="min-w-0 text-[12px]"><p className="font-semibold">Ravi Kumar</p><p className="text-[11px] text-muted-foreground">Verified partner · ~45 min</p></div>
        <Truck className="ml-auto h-4 w-4 text-primary" aria-hidden />
      </div>
    </div>
  );
}

export function HeroShowcase({ compact = false }: { compact?: boolean }) {
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4200);
    return () => clearInterval(id);
  }, [paused, reduced]);
  const S = SCENES[scene];

  const dots = (
    <div className="flex gap-2" role="tablist" aria-label="App preview">
      {SCENES.map((s, i) => (
        <button key={s.key} type="button" role="tab" aria-selected={i === scene} onClick={() => { setScene(i); setPaused(true); }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${i === scene ? "bg-white text-foreground" : "bg-white/15 text-white hover:bg-white/25"}`}>
          <s.icon className="h-3.5 w-3.5" aria-hidden />{s.label}
        </button>
      ))}
    </div>
  );

  if (compact)
    return (
      <div className="hero-gradient relative overflow-hidden px-5 py-4 text-white">
        <div key={S.key} className="hero-fade flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><S.icon className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0"><p className="text-sm font-semibold">{S.title}</p><p className="truncate text-xs text-white/80">{S.alert}</p></div>
        </div>
      </div>
    );

  return (
    <section className="hero-gradient relative flex h-full min-h-screen flex-col justify-between overflow-hidden p-10 text-white"
      aria-roledescription="carousel" aria-label="What WellNest does" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="hero-blob left-[-10%] top-[-10%] h-80 w-80 bg-white/15" aria-hidden />
      <span className="hero-blob bottom-[-15%] right-[-10%] h-96 w-96 bg-[oklch(0.75_0.15_45/0.45)] [animation-delay:-6s]" aria-hidden />

      <p className="relative text-sm font-medium text-white/80">Trusted care for parents, peace of mind for families</p>

      <div className="relative mx-auto flex w-full max-w-sm flex-col items-center">
        {/* phone */}
        <div className="hero-float w-72 rounded-[2rem] xl:w-80 border border-white/30 bg-white/10 p-2 shadow-2xl backdrop-blur-sm">
          <div className="overflow-hidden rounded-[1.6rem] bg-background p-3 text-foreground">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-[10px] text-muted-foreground">Good morning</p><p className="text-[13px] font-bold">Kamala</p></div>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">W</span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1.5" aria-hidden>
              {SCENES.map((s, i) => (
                <span key={s.key} className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[9px] font-semibold transition ${i === scene ? "border-primary/40 bg-secondary text-secondary-foreground" : "bg-white text-muted-foreground"}`}>
                  <s.icon className="h-3.5 w-3.5" />{s.label}
                </span>
              ))}
            </div>
            <div key={S.key} className="hero-fade h-[190px]"><Screen scene={scene} /></div>
          </div>
        </div>
        {/* family alert */}
        <div key={`alert-${S.key}`} className="hero-pop -mt-8 ml-28 flex w-72 items-center gap-2.5 rounded-xl bg-white/95 p-2.5 text-foreground shadow-xl" role="status">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Bell className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Family alert</p><p className="text-[12px] font-medium leading-snug">{S.alert}</p></div>
        </div>
      </div>

      <div className="relative">
        <div key={`cap-${S.key}`} className="hero-fade min-h-[88px]">
          <h2 className="text-2xl font-bold">{S.title}</h2>
          <p className="mt-1 max-w-md text-white/85">{S.sub}</p>
        </div>
        <div className="mt-5">{dots}</div>
      </div>
    </section>
  );
}
