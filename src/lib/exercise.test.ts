import { describe, expect, it } from "vitest";
import { blankPlan, planProblem, planUnsuitable, youtubeEmbed, youtubeId } from "./exercise";
import type { HealthProfile } from "./seed";

describe("YouTube links", () => {
  it("reads the video ID from every common link form", () => {
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?si=abc", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"])
      expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
  });
  it("rejects non-YouTube or malformed links", () => {
    for (const url of ["https://vimeo.com/123", "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "javascript:alert(1)", "", undefined])
      expect(youtubeId(url as string)).toBeNull();
  });
  it("embeds without tracking cookies", () => expect(youtubeEmbed("dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ"));
});

describe("coach plans", () => {
  const plan = { ...blankPlan("c1"), name: "Chair yoga week", days: blankPlan("c1").days.map((d) => ({ ...d, title: d.minutes ? "Chair yoga" : "" })) };
  it("accepts a complete plan", () => expect(planProblem(plan)).toBeNull());
  it("needs a name, mobility, valid minutes and YouTube-only videos", () => {
    expect(planProblem({ ...plan, name: "" })).toMatch(/name/);
    expect(planProblem({ ...plan, mobility: [] })).toMatch(/mobility/);
    expect(planProblem({ ...plan, days: plan.days.map((d, i) => (i === 0 ? { ...d, minutes: 90 } : d)) })).toMatch(/0–60/);
    expect(planProblem({ ...plan, days: plan.days.map((d, i) => (i === 0 ? { ...d, videoUrl: "https://vimeo.com/1" } : d)) })).toMatch(/YouTube/);
    expect(planProblem({ ...plan, days: plan.days.slice(0, 6) })).toMatch(/Monday to Sunday/);
  });
  it("hides plans that clash with the senior's conditions or mobility", () => {
    const h: HealthProfile = { conditions: ["heart"], diet: "veg", mobility: "limited", allergies: "" };
    expect(planUnsuitable({ ...plan, notFor: ["heart"] }, h)).toMatch(/health/);
    expect(planUnsuitable({ ...plan, notFor: [], mobility: ["independent"] }, h)).toMatch(/mobility/);
    expect(planUnsuitable({ ...plan, notFor: ["diabetes"], mobility: ["limited"] }, h)).toBeNull();
    expect(planUnsuitable({ ...plan, mobility: ["limited"], hidden: true }, h)).toBe("Not available");
  });
});
