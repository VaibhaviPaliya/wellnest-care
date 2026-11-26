/**
 * Installable app (PWA) support: service worker registration and the browser's install prompt.
 * The service worker is registered only on the real site — never in development or inside Lovable's
 * editor preview (an iframe), where caching would get in the way of live edits.
 */
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; }

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Chrome/Edge/Android fire this once, often before React mounts — keep it for the Install button.
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export const inPreviewFrame = () => typeof window !== "undefined" && window.self !== window.top;
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIOS = () =>
  typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV || inPreviewFrame()) {
    // Clean up any worker left over from an earlier visit, so previews always show the latest code.
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
    return;
  }
  const go = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
}

const DISMISS_KEY = "wellnest-install-dismissed";
const dismissedRecently = () => {
  try { const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0); return Date.now() - at < 14 * 86400000; } catch { return false; }
};

/** What the Install card should offer on this device. */
export function useInstallPrompt() {
  const [, force] = useState(0);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(isStandalone() || inPreviewFrame() || dismissedRecently());
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const mode: "prompt" | "ios" | "none" = hidden ? "none" : deferred ? "prompt" : isIOS() ? "ios" : "none";
  return {
    mode,
    install: async () => {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      notify();
      return outcome === "accepted";
    },
    dismiss: () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ } setHidden(true); },
  };
}
