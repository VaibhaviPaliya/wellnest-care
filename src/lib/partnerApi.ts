/** Cloud calls for reviews and certificates (migration 0007). The database enforces who may do what. */
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const friendly = (m: string) => (/does not exist|schema cache/i.test(m) ? "This needs the latest Cloud update (run the batch SQL)." : m);
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
}

export interface PublicReview { booking_id: string; rating: number; punctuality: number | null; safety: number | null; explanation: number | null; text: string | null; at: string; reviewer: string; hidden: boolean; }
export interface Certificate { id: string; partner_id: string; owner_user: string; name: string; issuer: string; status: "pending" | "approved" | "rejected"; note: string | null; uploaded_at: string; reviewed_at: string | null; }

export const partnerReviews = (partnerId: string) => rpc<PublicReview[]>("partner_reviews", { _partner: partnerId });
export const hideReview = (bookingId: string, hidden: boolean) => rpc("admin_hide_review", { _booking: bookingId, _hidden: hidden });
export const uploadCertificate = (name: string, issuer: string, doc: string) => rpc<string>("partner_upload_certificate", { _name: name, _issuer: issuer, _doc: doc });
export const deleteCertificate = (id: string) => rpc("partner_delete_certificate", { _id: id });
export const certificateDocument = (id: string) => rpc<string | null>("certificate_document", { _id: id });
export const reviewCertificate = (id: string, approve: boolean, note: string) => rpc("review_certificate", { _id: id, _approve: approve, _note: note });
/** Own certificates (coach) or all (admin) — never the file itself. */
export async function listCertificates(): Promise<Certificate[]> {
  const { data, error } = await db.from("partner_certificates").select("id,partner_id,owner_user,name,issuer,status,note,uploaded_at,reviewed_at").order("uploaded_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as Certificate[];
}
/** Reads a picked file as a data URL after checking type and size. */
export function readDocument(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) return reject(new Error("Upload a JPG, PNG, WebP or PDF."));
    if (file.size > 1024 * 1024) return reject(new Error("The file must be 1 MB or smaller."));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}
