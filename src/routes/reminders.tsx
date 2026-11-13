import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlarmClock, Pause, Play, Trash2 } from "lucide-react";
import { PageTitle, Shell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { localDate, type ReminderKind } from "@/lib/care";

export const Route = createFileRoute("/reminders")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Reminders | WellNest" },
      {
        name: "description",
        content:
          "Daily reminders for medicines, exercise, meals and water, shared with linked family.",
      },
      { property: "og:title", content: "Reminders | WellNest" },
      { property: "og:description", content: "Timed care reminders for seniors and family." },
    ],
  }),
  component: () => (
    <Shell roles={["senior", "family"]}>
      <Reminders />
    </Shell>
  ),
});

const KINDS: [ReminderKind, string][] = [
  ["medicine", "Medicine"],
  ["exercise", "Exercise"],
  ["meal", "Meal"],
  ["water", "Water"],
  ["other", "Other"],
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL = [0, 1, 2, 3, 4, 5, 6];

function Reminders() {
  const { db, senior, addReminder, toggleReminder, deleteReminder } = useStore();
  const { t } = useT();
  const [kind, setKind] = useState<ReminderKind>("medicine");
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<number[]>(ALL);
  if (!senior?.consent?.given)
    return (
      <p className="surface p-6 text-lg">
        This senior needs to complete their consent and health profile first.{" "}
        <Link to="/home" className="text-primary underline">
          {t("Home")}
        </Link>
      </p>
    );
  const list = db.care.reminders
    .filter((r) => r.seniorId === senior.id)
    .sort((a, b) => a.time.localeCompare(b.time));
  const today = localDate(new Date());
  const save = () => {
    const error = addReminder({ kind, label, time, days });
    if (error) return toast.error(error);
    toast.success(t("Reminder saved."));
    setLabel("");
  };
  const toggleDay = (d: number) =>
    setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const dayText = (ds: number[]) =>
    ds.length === 7 ? t("Every day") : ds.map((d) => t(DAYS[d])).join(", ");

  return (
    <>
      <PageTitle
        title="Reminders"
        sub="Daily reminders for medicines, exercise, meals and water. Linked family members are alerted too."
      />
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <section className="surface h-fit p-5">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <AlarmClock className="h-6 w-6 text-accent" />
            {t("Add a reminder")}
          </h2>
          <label className="mt-4 block font-bold" htmlFor="rem-kind">
            {t("Type")}
          </label>
          <select
            id="rem-kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReminderKind)}
          >
            {KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {t(l)}
              </option>
            ))}
          </select>
          <label className="mt-4 block font-bold" htmlFor="rem-label">
            {t("What to remember")}
          </label>
          <input
            id="rem-label"
            className="field"
            maxLength={80}
            placeholder={
              kind === "medicine"
                ? "Metformin after breakfast"
                : kind === "water"
                  ? "Drink a glass of water"
                  : ""
            }
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label className="mt-4 block font-bold" htmlFor="rem-time">
            {t("Time")}
          </label>
          <input
            id="rem-time"
            type="time"
            className="field"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <fieldset className="mt-4">
            <legend className="font-bold">{t("Repeat on")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="care"
                size="care"
                className="chip"
                aria-pressed={days.length === 7}
                onClick={() => setDays(days.length === 7 ? [] : ALL)}
              >
                {t("Every day")}
              </Button>
              {DAYS.map((d, i) => (
                <Button
                  variant="care"
                  size="care"
                  key={d}
                  className="chip min-w-14"
                  aria-pressed={days.includes(i)}
                  onClick={() => toggleDay(i)}
                >
                  {t(d)}
                </Button>
              ))}
            </div>
          </fieldset>
          <Button
            variant="care"
            size="care"
            className="btn btn-primary mt-5 w-full"
            disabled={!label.trim() || !days.length}
            onClick={save}
          >
            {t("Save reminder")}
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Reminders show while WellNest is open in this browser. You also get an alert 30 minutes before every booking.",
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Reminders are not medical advice. Follow your doctor’s dosage instructions.")}
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-bold">{t("Your reminders")}</h2>
          {list.length === 0 ? (
            <p className="surface p-6 text-lg text-muted-foreground">{t("No reminders yet.")}</p>
          ) : (
            <ul className="space-y-3">
              {list.map((r) => (
                <li
                  key={r.id}
                  className={`surface flex flex-wrap items-center gap-3 p-4 ${r.active ? "" : "opacity-60"}`}
                >
                  <span className="font-display text-2xl font-bold">{r.time}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-lg font-bold">{r.label}</p>
                    <p className="text-muted-foreground">
                      {t(KINDS.find(([k]) => k === r.kind)?.[1] ?? "Other")} · {dayText(r.days)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {!r.active && <span className="tag">{t("Paused")}</span>}
                      {r.lastFired === today && <span className="tag">{t("Done today")}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="care"
                      size="care"
                      className="btn btn-outline min-h-11 px-3 text-base"
                      onClick={() => toggleReminder(r.id)}
                    >
                      {r.active ? (
                        <>
                          <Pause className="h-4 w-4" />
                          {t("Pause")}
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          {t("Resume")}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="care"
                      size="care"
                      className="btn btn-outline min-h-11 px-3 text-base text-destructive"
                      aria-label={`${t("Delete")} ${r.label}`}
                      onClick={() => deleteReminder(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">{t("Delete")}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
