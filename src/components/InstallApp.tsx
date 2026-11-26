import { Download, Share, SquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "./BrandMark";
import { useInstallPrompt } from "@/lib/pwa";

/** "Install the WellNest app" card. Shows the native prompt on Android/Chrome and steps for iPhone. */
export function InstallApp({ note, className = "" }: { note?: string; className?: string }) {
  const { mode, install, dismiss } = useInstallPrompt();
  if (mode === "none") return null;
  return (
    <aside className={`relative flex items-start gap-3 rounded-2xl border bg-card p-4 ${className}`} aria-label="Install the WellNest app">
      <BrandMark size={44} />
      <div className="min-w-0 flex-1 pr-6">
        <p className="font-bold">Install the WellNest app</p>
        {mode === "prompt" ? (
          <>
            <p className="text-sm text-muted-foreground">{note ?? "Open WellNest from your home screen like any other app — quicker, full-screen, no browser bar."}</p>
            <button type="button" className="btn btn-primary mt-3" onClick={() => void install().then((ok) => ok && toast.success("Installed! Find WellNest on your home screen."))}>
              <Download className="h-4 w-4" />Install app
            </button>
          </>
        ) : (
          <ol className="mt-1 space-y-1 text-sm text-muted-foreground">
            <li>1. Tap <Share className="inline h-4 w-4 align-[-3px] text-primary" aria-hidden /> <strong className="text-foreground">Share</strong> in Safari’s toolbar</li>
            <li>2. Choose <SquarePlus className="inline h-4 w-4 align-[-3px] text-primary" aria-hidden /> <strong className="text-foreground">Add to Home Screen</strong></li>
            <li>3. Tap <strong className="text-foreground">Add</strong>{note ? ` — ${note.charAt(0).toLowerCase()}${note.slice(1)}` : ""}</li>
          </ol>
        )}
      </div>
      <button type="button" className="absolute right-2 top-2 rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Not now" onClick={dismiss}><X className="h-4 w-4" /></button>
    </aside>
  );
}
