import { useEffect, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { sendPhoneOtp, verifyMyMobile } from "@/lib/otp.functions";

export const isIndianMobile = (p: string) => /^[6-9]\d{9}$/.test(p);
export const mobileHint = (p: string) =>
  !p ? "" : p.length < 10 ? `${10 - p.length} more digit${p.length === 9 ? "" : "s"}` : isIndianMobile(p) ? "" : "Indian mobile numbers start with 6, 7, 8 or 9.";
const RESEND_SECONDS = 30;

/** Resend countdown shared by the sign-in page and this widget. */
export function useCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (until <= now) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [until, now]);
  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start: () => { setNow(Date.now()); setUntil(Date.now() + RESEND_SECONDS * 1000); } };
}

/**
 * Add or change the signed-in user's mobile number by SMS code (Twilio Verify; demo code when SMS isn't set up).
 * The number is saved on the server only after the code checks out.
 */
export function MobileVerify({ current, onVerified, label = "Mobile number" }: { current?: string; onVerified?: (phone: string) => void; label?: string }) {
  const { refresh } = useStore();
  const [editing, setEditing] = useState(!current);
  const [phone, setPhone] = useState(current ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<"sms" | "demo" | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useCountdown();

  const send = async () => {
    if (!isIndianMobile(phone)) return toast.error("Enter a valid 10-digit Indian mobile number.");
    setBusy(true);
    try {
      const { mode } = await sendPhoneOtp({ data: { phone } });
      setSent(mode); setCode(""); timer.start();
      toast.success(mode === "sms" ? `We've texted a 6-digit code to +91 ${phone}.` : "Demo mode — SMS isn't set up yet. Use code 123456.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the code."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await verifyMyMobile({ data: { phone, code } });
      await refresh();
      toast.success("Mobile number verified.");
      setEditing(false); setSent(null); onVerified?.(phone);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't verify the code."); }
    finally { setBusy(false); }
  };

  if (!editing && current) return (
    <div>
      <p className="mb-1 font-bold">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="field flex w-auto items-center gap-2 font-semibold"><BadgeCheck className="h-5 w-5 text-success" aria-hidden />+91 {current}</span>
        <span className="text-sm font-semibold text-success">Verified</span>
        <button type="button" className="text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => { setEditing(true); setPhone(""); }}>Change</button>
      </div>
    </div>
  );
  const hint = mobileHint(phone);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="mv-phone" className="mb-1 block font-bold">{label}</label>
        <div className="flex gap-2">
          <span className="field flex w-auto items-center font-bold">+91</span>
          <input id="mv-phone" className="field tracking-wider" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98765 43210"
            value={phone} disabled={!!sent} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} aria-invalid={!!hint && phone.length === 10} aria-describedby="mv-hint" />
          {!sent && <button type="button" className="btn btn-primary shrink-0" disabled={busy || !isIndianMobile(phone)} onClick={() => void send()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}</button>}
        </div>
        <p id="mv-hint" className={`mt-1 text-xs ${hint && phone.length === 10 ? "text-destructive" : "text-muted-foreground"}`}>{hint || "We'll text a 6-digit code to confirm it's yours."}</p>
      </div>
      {sent && (
        <div>
          <label htmlFor="mv-code" className="mb-1 block font-bold">Code sent to +91 {phone}</label>
          <div className="flex gap-2">
            <input id="mv-code" className="field text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="btn btn-primary shrink-0" disabled={busy || code.length !== 6} onClick={() => void verify()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}</button>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {sent === "demo" && <span>Demo code: <strong>123456</strong></span>}
            {timer.left > 0 ? <span>Resend in {timer.left}s</span> : <button type="button" className="font-semibold text-primary" onClick={() => void send()}>Resend code</button>}
            <button type="button" className="font-semibold text-primary" onClick={() => { setSent(null); setCode(""); }}>Change number</button>
          </p>
        </div>
      )}
    </div>
  );
}
