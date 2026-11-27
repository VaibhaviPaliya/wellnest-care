/**
 * Coach-made weekly exercise plans: YouTube links, plan validation, and the safety filter that decides
 * which plans a senior is shown. Browser-safe; the Cloud function coach_save_plan applies the same rules.
 */
import type { Condition, HealthProfile, Mobility } from "./seed";
import type { ExercisePlan } from "./care";

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MAX_PLANS_PER_COACH = 10;

/** The 11-character video ID from any common YouTube link (watch, youtu.be, shorts, embed, mobile). */
export function youtubeId(url: string | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname); id = m?.[2] ?? null; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
/** Privacy-enhanced embed: no tracking cookies until play, no unrelated suggestions. */
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function planProblem(p: Pick<ExercisePlan, "name" | "days" | "intensity" | "notFor" | "mobility" | "description">): string | null {
  if (!p.name?.trim() || p.name.length > 80) return "Give the plan a name (up to 80 characters).";
  if ((p.description ?? "").length > 300) return "Keep the description under 300 characters.";
  if (!["gentle", "moderate"].includes(p.intensity ?? "")) return "Choose gentle or moderate intensity.";
  if (!p.mobility?.length) return "Choose who can follow this plan (mobility).";
  if (p.days.length !== 7 || p.days.some((d, i) => d.day !== WEEK_DAYS[i])) return "A plan has exactly one entry for each day, Monday to Sunday.";
  for (const d of p.days) {
    if (!Number.isInteger(d.minutes) || d.minutes < 0 || d.minutes > 60) return `${d.day}: minutes must be 0–60 (0 = rest day).`;
    if (d.minutes > 0 && (!d.title.trim() || d.title.length > 80)) return `${d.day}: describe the exercise (up to 80 characters).`;
    if (d.videoUrl && !youtubeId(d.videoUrl)) return `${d.day}: use a YouTube link (set the video to Unlisted).`;
  }
  if (!p.days.some((d) => d.minutes > 0)) return "Add at least one exercise day.";
  return null;
}

/** Why a plan is not shown to this senior, or null when it suits them. */
export function planUnsuitable(p: ExercisePlan, h: HealthProfile | undefined): string | null {
  if (p.hidden || p.published === false) return "Not available";
  if (!h) return "Complete the health profile first";
  const clash = (p.notFor ?? []).filter((c: Condition) => h.conditions.includes(c));
  if (clash.length) return "Not suitable for your health conditions";
  if (p.mobility?.length && !p.mobility.includes(h.mobility as Mobility)) return "Not suitable for your mobility";
  return null;
}

export const blankPlan = (coachId: string): ExercisePlan => ({
  id: "", coachId, name: "", description: "", intensity: "gentle", notFor: [], mobility: ["independent", "assisted"],
  days: WEEK_DAYS.map((day) => ({ day, title: "", minutes: day === "Sunday" ? 0 : 15 })), published: true,
});
