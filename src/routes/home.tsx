import { createFileRoute, Link } from "@tanstack/react-router";
import { Dumbbell, Soup, Pill, HandHeart, ArrowRight, CalendarClock, AlarmClock } from "lucide-react";
import { Shell, fmtWhen, STATUS_LABEL } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { CONDITION_LABEL } from "@/lib/seed";
import { useT } from "@/lib/i18n";
import { localDate } from "@/lib/care";
import { ExerciseProgress } from "@/components/ExerciseProgress";

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
  { to: "/fitness", title: "Fitness Coaches", sub: "Yoga, mobility & meditation — at home or online", icon: Dumbbell, bg: "bg-tile-fit ring-1 ring-primary/10" },
  { to: "/meals", title: "Health-Suitable Meals", sub: "Dishes chosen for your health needs", icon: Soup, bg: "bg-tile-meal ring-1 ring-accent/15" },
  { to: "/pharmacy", title: "Medicines & Delivery", sub: "Upload prescription, get it delivered", icon: Pill, bg: "bg-tile-med ring-1 ring-primary/10" },
  { to: "/therapy", title: "Therapy Massage", sub: "Certified therapists, at home", icon: HandHeart, bg: "bg-tile-fit ring-1 ring-primary/10" },
] as const;

function HomePage() {
  const { me, senior, db } = useStore();
  const { t } = useT();
  if (!me || !senior) return <NoSenior />;
  const mine = db.bookings.filter((b) => b.seniorId === senior.id && !["completed", "cancelled"].includes(b.status)).sort((a, b) => a.when.localeCompare(b.when));
  const todayStr = new Date().toDateString();
  const today = mine.filter((b) => new Date(b.when).toDateString() === todayStr);
  const upcoming = mine.filter((b) => new Date(b.when).toDateString() !== todayStr);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning, {name}" : hour < 17 ? "Good afternoon, {name}" : "Good evening, {name}";

  return (
    <>
      <h1 className="text-2xl font-bold md:text-3xl">{t(greet, { name: me.name.split(" ")[0] })}</h1>
      {me.role === "family" ? (
        <p className="mt-1 text-muted-foreground">{t("You’re looking after {name}. Anything you book is for them.", { name: senior.name })}</p>
      ) : (
        <p className="mt-1 text-muted-foreground">{t("What would you like help with today?")}</p>
      )}
      {!!senior.health?.conditions.length && (
        <div className="mt-3 flex flex-wrap gap-2">{senior.health.conditions.map((c) => <span key={c} className="tag">{CONDITION_LABEL[c]}</span>)}</div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <Link key={tile.to} to={tile.to} className="group surface flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-primary/40">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${tile.bg}`}><tile.icon className="h-6 w-6 text-primary" strokeWidth={2} /></span>
            <h2 className="mt-4 text-lg font-bold">{t(tile.title)}</h2>
            <p className="mt-1 flex-1 text-[0.95rem] text-muted-foreground">{t(tile.sub)}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">{t("Open")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
          </Link>
        ))}
      </div>

      <ExerciseProgress seniorId={senior.id} name={senior.name.split(" ")[0]} />
      <TodayReminders seniorId={senior.id} />
      <Section title="Today" items={today} empty="Nothing scheduled for today." />
      <Section title="Coming up" items={upcoming} empty="No upcoming bookings yet." />
    </>
  );
}

function TodayReminders({ seniorId }: { seniorId: string }) {
  const { db } = useStore();
  const { t } = useT();
  const now = new Date();
  const today = localDate(now);
  const list = db.care.reminders.filter((r) => r.seniorId === seniorId && r.active && r.days.includes(now.getDay())).sort((a, b) => a.time.localeCompare(b.time));
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold"><AlarmClock className="h-6 w-6 text-accent" />{t("Today’s reminders")}</h2>
        <Link to="/reminders" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{t("Manage reminders")}</Link>
      </div>
      {list.length === 0 ? <p className="surface p-5 text-base text-muted-foreground">{t("No reminders set for today.")}</p> : (
        <ul className="flex flex-wrap gap-3">
          {list.map((r) => (
            <li key={r.id} className={`surface flex items-center gap-3 px-4 py-3 ${r.lastFired === today ? "opacity-70" : ""}`}>
              <span className="font-display text-base font-semibold">{r.time}</span>
              <span className="text-base">{r.label}</span>
              {r.lastFired === today && <span className="tag">{t("Done today")}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Section({ title, items, empty }: { title: string; items: ReturnType<typeof useStore>["db"]["bookings"]; empty: string }) {
  const { t } = useT();
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{t(title)}</h2>
        <Link to="/activity" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{t("See all")}</Link>
      </div>
      {items.length === 0 ? <p className="surface p-5 text-base text-muted-foreground">{t(empty)}</p> : (
        <ul className="space-y-3">
          {items.map((b) => (
            <li key={b.id} className="surface flex items-center gap-4 p-4">
              <CalendarClock className="h-8 w-8 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">{b.title}</p>
                <p className="text-muted-foreground">{fmtWhen(b.when)} · {b.partnerName}</p>
              </div>
              <span className="tag">{t(STATUS_LABEL[b.status])}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoSenior() {
  const { t } = useT();
  return (
    <div className="surface p-8 text-center">
      <h1 className="text-2xl font-bold">{t("Link a family member first")}</h1>
      <p className="mt-2 text-base text-muted-foreground">Connect to your parent’s or relative’s WellNest account to book and track care for them.</p>
      <Link to="/family" className="btn btn-primary mt-6">{t("Link a senior")}</Link>
    </div>
  );
}
