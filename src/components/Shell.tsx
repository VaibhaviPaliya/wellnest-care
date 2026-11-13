import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, Home, ClipboardList, Users, ShieldCheck, LogOut, UserRound, Loader2, CheckCircle2, Smartphone } from "lucide-react";
import { useStore } from "@/lib/store";
import { LangToggle, useT } from "@/lib/i18n";
import type { Role } from "@/lib/seed";

export function Logo() {
  const { t } = useT();
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">W</span>
      <span className="leading-tight">
        <span className="block font-display text-xl font-bold">WellNest</span>
        <span className="block whitespace-nowrap text-xs text-muted-foreground">{t("Care that comes home")}</span>
      </span>
    </Link>
  );
}

/** Guards a page: requires login, consent + health for seniors, and the given roles. */
export function Shell({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { ready, me, db, logout } = useStore();
  const { t } = useT();
  const nav = useNavigate();
  useEffect(() => {
    if (!ready) return;
    if (!me) { nav({ to: "/" }); return; }
    if (me.role === "senior" && (!me.consent?.given || !me.health)) { nav({ to: "/onboarding" }); return; }
    if (roles && !roles.includes(me.role)) nav({ to: me.role === "admin" ? "/admin" : "/home" });
  }, [ready, me, roles, nav]);

  if (!ready || !me) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if ((me.role === "senior" && (!me.consent?.given || !me.health)) || (roles && !roles.includes(me.role))) return null;
  const unread = db.notices.filter((n) => n.userId === me.id && !n.read).length;
  const links = me.role === "admin"
    ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }, { to: "/profile", label: "Profile", icon: UserRound }]
    : [
        { to: "/home", label: "Home", icon: Home },
        { to: "/activity", label: "Bookings", icon: ClipboardList },
        { to: "/alerts", label: "Alerts", icon: Bell, badge: unread },
        me.role === "family" ? { to: "/family", label: "Family", icon: Users } : { to: "/profile", label: "Profile", icon: UserRound },
        ...(me.role === "family" ? [{ to: "/profile", label: "Profile", icon: UserRound }] : []),
      ];

  return (
    <div className="min-h-screen pb-28 lg:pb-10">
      <header className="sticky top-0 z-30 border-b-2 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-0.5 lg:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="relative flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 font-semibold hover:bg-muted" activeProps={{ className: "bg-secondary" }}>
                <l.icon className="h-5 w-5" />{t(l.label)}
                {!!l.badge && <span className="rounded-full bg-accent px-2 text-sm text-accent-foreground">{l.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Button variant="care" size="care" onClick={() => { logout(); nav({ to: "/" }); }} className="btn btn-outline min-h-11 px-3 text-base" aria-label={t("Log out")}>
              <LogOut className="h-5 w-5" /><span className="hidden whitespace-nowrap lg:inline">{t("Log out")}</span>
            </Button>
          </div>
        </div>
      </header>
      {me.role !== "admin" && <ReminderRunner />}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <nav className={`fixed inset-x-0 bottom-0 z-30 grid border-t-2 bg-card lg:hidden ${links.length === 2 ? "grid-cols-2" : links.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="relative flex flex-col items-center gap-1 py-3 text-sm font-semibold text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <l.icon className="h-6 w-6" />{t(l.label)}
            {!!l.badge && <span className="absolute right-1/4 top-2 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{l.badge}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Checks every 30 seconds for due reminders and bookings starting within 30 minutes. */
function ReminderRunner() {
  const { runTimers, senior, db } = useStore();
  const { t } = useT();
  const run = useRef(runTimers);
  run.current = runTimers;
  const active = !!senior?.consent?.given && db.care.reminders.length + db.bookings.length > 0;
  useEffect(() => {
    if (!active) return;
    const tick = () => { for (const title of run.current()) toast.info(title, { duration: 15000, description: t("Reminders") }); };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [active, senior?.id, t]);
  return null;
}

export function PageTitle({ title, sub, back = true }: { title: string; sub?: string; back?: boolean }) {
  const { t } = useT();
  return (
    <div className="mb-6">
      {back && <Link to="/home" className="mb-2 inline-block font-semibold text-primary underline-offset-4 hover:underline">{t("← Back to home")}</Link>}
      <h1 className="text-3xl font-bold md:text-4xl">{t(title)}</h1>
      {sub && <p className="mt-1 text-lg text-muted-foreground">{t(sub)}</p>}
    </div>
  );
}

/** Simulated UPI checkout. */
export function UpiCheckout({ open, amount, title, onClose, onPaid, onDone }: { open: boolean; amount: number; title: string; onClose: () => void; onPaid: () => void; onDone: () => void }) {
  const [app, setApp] = useState("GPay");
  const [vpa, setVpa] = useState("kamala@okaxis");
  const [stage, setStage] = useState<"form" | "paying" | "done">("form");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paying = useRef(false);
  useEffect(() => { if (open) setStage("form"); }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!open) return null;
  const pay = () => {
    if (paying.current) return;
    paying.current = true;
    setStage("paying");
    timer.current = setTimeout(() => {
      try { onPaid(); setStage("done"); }
      catch (error) { setStage("form"); toast.error(error instanceof Error ? error.message : "Could not confirm your booking. Please try again."); }
      finally { paying.current = false; }
    }, 1600);
  };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && stage !== "paying") { if (stage === "done") onDone(); else onClose(); } }}>
      <DialogContent aria-describedby="payment-description" onEscapeKeyDown={(event) => { if (stage === "paying") event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">UPI payment</DialogTitle>
        <DialogDescription id="payment-description" className="sr-only">Simulated payment. No money is charged.</DialogDescription>
        {stage === "done" ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
            <h2 className="mt-3 text-2xl font-bold">Payment successful</h2>
            <p className="mt-1 text-muted-foreground">₹{amount} paid · Family has been notified</p>
            <Button variant="care" size="care" className="btn btn-primary mt-6 w-full" onClick={onDone}>Done</Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">UPI Checkout (demo)</p>
            <h2 className="mt-1 text-2xl font-bold">{title}</h2>
            <p className="my-4 font-display text-4xl font-bold">₹{amount}</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {["GPay", "PhonePe", "Paytm", "BHIM"].map((a) => (
                <Button variant="care" size="care" key={a} className="chip" aria-pressed={app === a} onClick={() => setApp(a)}><Smartphone className="h-4 w-4" />{a}</Button>
              ))}
            </div>
            <label className="mb-1 block font-semibold" htmlFor="vpa">UPI ID</label>
            <input id="vpa" className="field" value={vpa} onChange={(e) => setVpa(e.target.value)} />
            <div className="mt-6 flex gap-3">
              <Button variant="care" size="care" className="btn btn-outline flex-1" onClick={onClose} disabled={stage === "paying"}>Cancel</Button>
              <Button variant="care" size="care" className="btn btn-accent flex-1" onClick={pay} disabled={stage === "paying" || !vpa.includes("@")}>
                {stage === "paying" ? <><Loader2 className="h-5 w-5 animate-spin" />Paying…</> : `Pay with ${app}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", in_progress: "Being prepared", out_for_delivery: "Out for delivery",
  completed: "Completed", cancelled: "Cancelled", pending_review: "Pharmacy reviewing",
};
