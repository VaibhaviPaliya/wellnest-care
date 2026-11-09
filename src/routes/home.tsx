import { createFileRoute, Link } from "@tanstack/react-router";
import { Dumbbell, Soup, Pill, ArrowRight, CalendarClock } from "lucide-react";
import { Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { CONDITION_LABEL } from "@/lib/seed";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Home | WellNest" },
      { name: "description", content: "Your fitness sessions, meals and medicine deliveries at a glance." },
      { property: "og:title", content: "Home | WellNest" },
      { property: "og:description", content: "Today’s and upcoming care at a glance." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><HomePage /></Shell>,
});

const TILES = [
  { to: "/fitness", title: "Fitness Coaches", sub: "Yoga, mobility & meditation — at home or online", icon: Dumbbell, bg: "bg-tile-fit" },
  { to: "/meals", title: "Health-Suitable Meals", sub: "Dishes chosen for your health needs", icon: Soup, bg: "bg-tile-meal" },
  { to: "/pharmacy", title: "Medicines & Delivery", sub: "Upload prescription, get it delivered", icon: Pill, bg: "bg-tile-med" },
] as const;

function HomePage() {
  const { me, senior, db } = useStore();
  if (!me || !senior) return <NoSenior />;
  const mine = db.bookings.filter((b) => b.seniorId === senior.id && !["completed", "cancelled"].includes(b.status)).sort((a, b) => a.when.localeCompare(b.when));
  const todayStr = new Date().toDateString();
  const today = mine.filter((b) => new Date(b.when).toDateString() === todayStr);
  const upcoming = mine.filter((b) => new Date(b.when).toDateString() !== todayStr);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <h1 className="text-3xl font-bold md:text-4xl">{greet}, {me.name.split(" ")[0]}</h1>
      {me.role === "family" ? (
        <p className="mt-1 text-lg text-muted-foreground">You’re looking after <strong className="text-foreground">{senior.name}</strong>. Anything you book is for them.</p>
      ) : (
        <p className="mt-1 text-lg text-muted-foreground">What would you like help with today?</p>
      )}
      {!!senior.health?.conditions.length && (
        <div className="mt-3 flex flex-wrap gap-2">{senior.health.conditions.map((c) => <span key={c} className="tag">{CONDITION_LABEL[c]}</span>)}</div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className={`group surface flex flex-col p-6 transition hover:-translate-y-1 ${t.bg}`}>
            <t.icon className="h-12 w-12 text-primary" strokeWidth={1.8} />
            <h2 className="mt-4 text-2xl font-bold">{t.title}</h2>
            <p className="mt-1 flex-1 text-lg">{t.sub}</p>
            <span className="mt-4 inline-flex items-center gap-2 font-bold text-primary">Open <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span>
          </Link>
        ))}
      </div>

      <Section title="Today" items={today} empty="Nothing scheduled for today." />
      <Section title="Coming up" items={upcoming} empty="No upcoming bookings yet." />
    </>
  );
}

function Section({ title, items, empty }: { title: string; items: ReturnType<typeof useStore>["db"]["bookings"]; empty: string }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        <Link to="/activity" className="font-semibold text-primary underline">See all</Link>
      </div>
      {items.length === 0 ? <p className="surface p-5 text-lg text-muted-foreground">{empty}</p> : (
        <ul className="space-y-3">
          {items.map((b) => (
            <li key={b.id} className="surface flex items-center gap-4 p-4">
              <CalendarClock className="h-8 w-8 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{b.title}</p>
                <p className="text-muted-foreground">{fmtWhen(b.when)} · {b.partnerName}</p>
              </div>
              <span className="tag">{STATUS_LABEL[b.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoSenior() {
  return (
    <div className="surface p-8 text-center">
      <h1 className="text-3xl font-bold">Link a family member first</h1>
      <p className="mt-2 text-lg text-muted-foreground">Connect to your parent’s or relative’s WellNest account to book and track care for them.</p>
      <Link to="/family" className="btn btn-primary mt-6">Link a senior</Link>
    </div>
  );
}
