import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

/** Turns demo cross-device sync on or off for this device (FR2, FR7). */
export function SyncSettings({ compact = false }: { compact?: boolean }) {
  const { sync } = useStore();
  const { t } = useT();
  const [room, setRoom] = useState(sync.settings.room);
  useEffect(() => setRoom(sync.settings.room), [sync.settings.room]);
  const on = sync.settings.enabled;
  const apply = (enabled: boolean) => {
    const error = sync.save({ enabled, room });
    if (error) return toast.error(error);
    toast.success(
      enabled
        ? t("Sync on. Use the same room code on the other phone.")
        : t("Sync off. Data stays on this device."),
    );
  };
  const status =
    sync.state === "live"
      ? t("Live · {n} other device(s) connected", { n: sync.peers })
      : sync.state === "connecting"
        ? t("Connecting…")
        : sync.state === "error"
          ? t("Could not connect. Check the internet connection.")
          : t("Off");
  const Body = (
    <>
      <p className="text-muted-foreground">
        {t(
          "Turn this on with the same room code on the senior’s and the family member’s phones to share bookings and alerts between them.",
        )}
      </p>
      <label htmlFor="sync-room" className="mt-3 block font-bold">
        {t("Room code")}
      </label>
      <input
        id="sync-room"
        className="field"
        maxLength={32}
        placeholder="e.g. iyer-family-2026"
        value={room}
        disabled={on}
        onChange={(e) => setRoom(e.target.value.replace(/[^A-Za-z0-9-]/g, ""))}
      />
      <p
        className={`mt-2 flex items-center gap-2 font-bold ${sync.state === "live" ? "text-success" : sync.state === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {sync.state === "live" ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        {status}
      </p>
      <Button
        variant="care"
        size="care"
        className={`btn mt-3 w-full ${on ? "btn-outline" : "btn-primary"}`}
        onClick={() => apply(!on)}
      >
        {on ? t("Turn off sync") : t("Turn on sync")}
      </Button>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Demo only: everyone with this room code receives this demo’s data, including health profiles. Use test data. Uploaded prescriptions and records stay on this device.",
        )}
      </p>
    </>
  );
  if (compact)
    return (
      <details className="mt-4 rounded-xl border-2 p-3">
        <summary className="flex cursor-pointer items-center gap-2 font-bold">
          <Smartphone className="h-5 w-5" />
          {t("Use on two phones")}
          {on && <span className="tag">{status}</span>}
        </summary>
        <div className="mt-2">{Body}</div>
      </details>
    );
  return (
    <section className="surface p-5">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <Smartphone className="h-6 w-6" />
        {t("Use on two phones")}
      </h2>
      {Body}
    </section>
  );
}
