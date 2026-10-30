import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BellRing } from "lucide-react";
import { PageTitle, Shell, fmtWhen } from "@/components/Shell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts | WellNest" },
      { name: "description", content: "Booking and order alerts for seniors and their linked family members." },
      { property: "og:title", content: "Alerts | WellNest" },
      { property: "og:description", content: "Real-time care alerts." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Alerts /></Shell>,
});

function Alerts() {
  const { db, me, markRead } = useStore();
  const list = db.notices.filter((n) => n.userId === me!.id);
  useEffect(() => { const t = setTimeout(markRead, 1500); return () => clearTimeout(t); }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageTitle title="Alerts" sub="Updates on bookings and orders." />
      <ul className="space-y-3">
        {list.map((n) => (
          <li key={n.id} className={`surface flex gap-4 p-4 ${n.read ? "" : "border-accent"}`}>
            <BellRing className={`h-7 w-7 shrink-0 ${n.read ? "text-muted-foreground" : "text-accent"}`} />
            <div>
              <p className="text-lg font-bold">{n.title}</p>
              <p>{n.body}</p>
              <p className="text-sm text-muted-foreground">{fmtWhen(n.at)}</p>
            </div>
          </li>
        ))}
        {list.length === 0 && <p className="surface p-6 text-lg text-muted-foreground">No alerts yet.</p>}
      </ul>
    </>
  );
}
