/** Therapy massage safety and booking helpers. The Cloud check_booking applies the same doctor-approval rule. */
import type { HealthProfile, Therapist } from "./seed";

/** Seniors with heart disease, high blood pressure or very limited mobility need a doctor's OK before massage. */
export const needsDoctorApproval = (h: HealthProfile | undefined) =>
  !!h && (h.conditions.includes("heart") || h.conditions.includes("high_bp") || h.mobility === "limited");

export const cheapestService = (t: Therapist) => t.services.reduce((m, s) => Math.min(m, s.price), Infinity);
