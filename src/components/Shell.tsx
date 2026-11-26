import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bell, Home, ClipboardList, Users, ShieldCheck, LogOut, UserRound, Loader2, CheckCircle2, Smartphone, Store } from "lucide-react";
import { useStore } from "@/lib/store";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useT } from "@/lib/i18n";
import type { Role } from "@/lib/seed";
import { RAZORPAY_KEY_ID, RAZORPAY_TEST_MODE, loadRazorpay, toPaise } from "@/lib/payments";
import { createPaymentOrder, verifyPayment } from "@/lib/payments.functions";

export function Logo() {
  const { t } = useT();
  return (
    <Link to="/" className="flex items-center gap-2">
      <BrandMark size={38} />
      <span className="leading-tight">
        <span className="block font-display text-base font-bold tracking-tight">Well<span className="text-primary">Nest</span></span>
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
    if (roles && !roles.includes(me.role)) nav({ to: me.role === "admin" ? "/admin" : me.role === "partner" ? "/partner" : "/home" });
  }, [ready, me, roles, nav]);

  if (!ready || !me) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if ((me.role === "senior" && (!me.consent?.given || !me.health)) || (roles && !roles.includes(me.role))) return null;
  const unread = db.notices.filter((n) => n.userId === me.id && !n.read).length;
  const links = me.role === "admin"
    ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }, { to: "/profile", label: "Profile", icon: UserRound }]
    : me.role === "partner"
    ? [{ to: "/partner", label: "Partner dashboard", icon: Store }, { to: "/profile", label: "Profile", icon: UserRound }]
    : [
        { to: "/home", label: "Home", icon: Home },
        { to: "/activity", label: "Bookings", icon: ClipboardList },
        { to: "/alerts", label: "Alerts", icon: Bell, badge: unread },
        me.role === "family" ? { to: "/family", label: "Family", icon: Users } : { to: "/profile", label: "Profile", icon: UserRound },
        ...(me.role === "family" ? [{ to: "/profile", label: "Profile", icon: UserRound }] : []),
      ];

  return (
    <div className="min-h-screen pb-28 lg:pb-10">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-0.5 lg:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="relative flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[0.93rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground" activeProps={{ className: "bg-secondary !text-secondary-foreground" }}>
                <l.icon className="h-[18px] w-[18px]" />{t(l.label)}
                {!!l.badge && <span className="rounded-full bg-accent px-2 text-sm text-accent-foreground">{l.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Button variant="care" size="care" onClick={() => { logout(); nav({ to: "/" }); }} className="btn btn-outline min-h-10 px-3 text-sm" aria-label={t("Log out")}>
              <LogOut className="h-5 w-5" /><span className="hidden whitespace-nowrap lg:inline">{t("Log out")}</span>
            </Button>
          </div>
        </div>
      </header>
      {me.role !== "admin" && <ReminderRunner />}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <nav className={`fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/90 backdrop-blur-md lg:hidden ${links.length === 2 ? "grid-cols-2" : links.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <l.icon className="h-[22px] w-[22px]" />{t(l.label)}
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
      {back && <Link to="/home" className="mb-2 inline-block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline">{t("← Back to home")}</Link>}
      <h1 className="text-2xl font-bold md:text-3xl">{t(title)}</h1>
      {sub && <p className="mt-1 text-muted-foreground">{t(sub)}</p>}
    </div>
  );
}

/** Razorpay checkout (test mode). Opens Razorpay's own window; the booking is saved only after the payment succeeds. */
export function UpiCheckout({ open, amount, title, onClose, onPaid, onDone }: { open: boolean; amount: number; title: string; onClose: () => void; onPaid: (paymentRef: string) => void; onDone: () => void }) {
  const { me } = useStore();
  // "razorpay": our dialog steps aside so Razorpay's window can take focus.
  const [stage, setStage] = useState<"form" | "preparing" | "razorpay" | "saving" | "done">("form");
  const [ref, setRef] = useState("");
  const busy = useRef(false);
  useEffect(() => { if (open) { setStage("form"); setRef(""); busy.current = false; } }, [open]);
  if (!open) return null;
  const reset = (message?: string) => { busy.current = false; setStage("form"); if (message) toast.error(message); };
  const save = (paymentRef: string) => {
    try { onPaid(paymentRef); setRef(paymentRef); setStage("done"); busy.current = false; }
    catch (error) { reset(`Payment ${paymentRef} went through, but the booking could not be saved: ${error instanceof Error ? error.message : "please try again"}.${RAZORPAY_TEST_MODE ? " This was a test payment, so no real money was taken." : " Contact support for a refund."}`); }
  };
  const pay = async () => {
    if (busy.current) return;
    busy.current = true;
    setStage("preparing");
    try {
      const [, order] = await Promise.all([loadRazorpay(), createPaymentOrder({ data: { amount, purpose: title } })]);
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Razorpay did not load.");
      const rzp = new Razorpay({
        key: RAZORPAY_KEY_ID, amount: toPaise(amount), currency: "INR", name: "WellNest", description: title,
        ...(order.orderId ? { order_id: order.orderId } : {}),
        prefill: { name: me?.name, contact: me?.phone ? `+91${me.phone}` : undefined },
        notes: { purpose: title },
        theme: { color: "#0F7C74" },
        modal: { ondismiss: () => reset(), confirm_close: true },
        handler: async (r) => {
          setStage("saving");
          try {
            if (order.orderId) {
              if (!r.razorpay_order_id || !r.razorpay_signature) throw new Error("Payment details are incomplete.");
              const { ok } = await verifyPayment({ data: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } });
              if (!ok) throw new Error("Payment could not be verified.");
            }
            save(r.razorpay_payment_id);
          } catch (error) { reset(error instanceof Error ? error.message : "Payment could not be verified."); }
        },
      });
      rzp.on("payment.failed", (r) => toast.error(r.error?.description ?? "Payment failed. Please try again."));
      setStage("razorpay");
      rzp.open();
    } catch (error) { reset(error instanceof Error ? error.message : "Could not start the payment."); }
  };
  const working = stage === "preparing" || stage === "saving";
  return (
    <Dialog open={stage !== "razorpay"} onOpenChange={(value) => { if (!value && !working) { if (stage === "done") onDone(); else onClose(); } }}>
      <DialogContent aria-describedby="payment-description" onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">Payment</DialogTitle>
        <DialogDescription id="payment-description" className="sr-only">Pay securely with Razorpay.{RAZORPAY_TEST_MODE ? " Test mode: no real money is charged." : ""}</DialogDescription>
        {stage === "done" ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
            <h2 className="mt-3 text-lg font-bold">Payment successful</h2>
            <p className="mt-1 text-muted-foreground">₹{amount} paid · Family has been notified</p>
            <p className="mt-1 text-xs text-muted-foreground">Razorpay ref {ref}</p>
            <Button variant="care" size="care" className="btn btn-primary mt-6 w-full" onClick={onDone}>Done</Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Secure checkout · Razorpay{RAZORPAY_TEST_MODE ? " (test mode)" : ""}</p>
            <h2 className="mt-1 text-lg font-bold">{title}</h2>
            <p className="my-4 font-display text-3xl font-bold">₹{amount}</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Smartphone className="h-4 w-4" />UPI, cards, netbanking and wallets</p>
            {RAZORPAY_TEST_MODE && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">Test mode — no real money moves. In the Razorpay window choose <b>Netbanking</b> (or <b>Wallet</b>), pick any bank, then tap <b>Success</b> on the test page. UPI shows only as a QR code, which real UPI apps can’t pay in test mode.</p>}
            <div className="mt-6 flex gap-3">
              <Button variant="care" size="care" className="btn btn-outline flex-1" onClick={onClose} disabled={working}>Cancel</Button>
              <Button variant="care" size="care" className="btn btn-accent flex-1" onClick={pay} disabled={working}>
                {working ? <><Loader2 className="h-5 w-5 animate-spin" />{stage === "saving" ? "Confirming…" : "Opening…"}</> : `Pay ₹${amount}`}
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
