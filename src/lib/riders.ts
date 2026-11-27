/**
 * Delivery partners, dispatch and live tracking — browser side.
 * Everything here calls the Cloud functions from migration 0004; the database enforces who may do what.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Booking, DeliveryPartner } from "./seed";

export const VEHICLES = ["Motorbike", "Scooter", "Bicycle", "On foot", "Car"] as const;
export const OFFER_SECONDS = 60;
/** Average city speed used for arrival estimates (km/h), with a 1.3× allowance for roads vs straight line. */
const CITY_KMH = 18, ROAD_FACTOR = 1.3;

export type LatLng = { lat: number; lng: number };
export interface Tracking {
  who: string | null; role: "rider" | "coach"; vehicle: string | null;
  lat: number | null; lng: number | null; accuracy: number | null; located_at: string | null;
  status: string; home_lat: number | null; home_lng: number | null; pickup_lat: number | null; pickup_lng: number | null;
}
export interface JobDetails { name: string; phone: string | null; address: string | null; city: string | null; pincode: string | null; state: string | null; home_lat: number | null; home_lng: number | null; }
export interface FeedItem { booking_id: string; kind: "offer" | "job"; data: Booking & { pincode?: string } }

// ---------- pure helpers ----------

export function distanceKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
/** Rough minutes to arrive, rounded up; at least 1. */
export const etaMinutes = (km: number) => Math.max(1, Math.ceil(((km * ROAD_FACTOR) / CITY_KMH) * 60));
export const fresh = (iso: string | null | undefined, now = Date.now(), maxSec = 90) => !!iso && now - Date.parse(iso) <= maxSec * 1000;
export function offerSecondsLeft(offer: Booking["offer"], now = Date.now()): number {
  if (!offer) return 0;
  return Math.max(0, OFFER_SECONDS - Math.floor((now - Date.parse(offer.offeredAt)) / 1000));
}
export const riderStatus = (d: DeliveryPartner): "needs_account" | "needs_document" | "pending" | "verified" | "rejected" =>
  d.verified ? "verified" : d.status === "rejected" ? "rejected" : !d.riderUserId ? "needs_account" : !d.docUploadedAt ? "needs_document" : "pending";
export const RIDER_STATUS_LABEL = {
  needs_account: "Waiting for them to register", needs_document: "Waiting for masked Aadhaar", pending: "Awaiting admin verification",
  verified: "Verified", rejected: "Changes needed",
} as const;
/** Customer address as one line for navigation apps. */
export const addressLine = (j: Pick<JobDetails, "address" | "city" | "pincode" | "state">) => [j.address, j.city, j.state, j.pincode].filter(Boolean).join(", ");
export function navigateUrl(j: Pick<JobDetails, "address" | "city" | "pincode" | "state" | "home_lat" | "home_lng">): string {
  const dest = j.home_lat != null && j.home_lng != null ? `${j.home_lat},${j.home_lng}` : addressLine(j);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}
/** A masked Aadhaar shows only the last 4 digits; refuse files that obviously are not images/PDFs or are too big. */
export function aadhaarFileProblem(f: { type: string; size: number }): string | null {
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.type)) return "Upload a JPG, PNG, WebP or PDF.";
  if (f.size > 1024 * 1024) return "The file must be 1 MB or smaller.";
  return null;
}

// ---------- server calls ----------

// The 0004 functions are not in the generated types until Lovable regenerates them.
const rpc = async <T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
};
const friendly = (m: string) => (/does not exist|schema cache/i.test(m) ? "Live delivery needs the latest Cloud update (run the 0004 SQL)." : m);

export const saveRider = (d: { id?: string; name: string; phone: string; vehicle: string; aadhaarName?: string }) => rpc<string>("partner_save_rider", { _data: d });
export const removeRider = (id: string) => rpc("partner_remove_rider", { _id: id });
export const setPickup = (p: LatLng) => rpc("partner_set_pickup", { _lat: p.lat, _lng: p.lng });
export const assignRider = (booking: string, rider: string) => rpc("partner_assign_rider", { _booking: booking, _rider: rider });
export const partnerStatus = (booking: string, status: string) => rpc("partner_update_status", { _booking: booking, _status: status });
/** Coach / therapist: on the way to a home visit (alerts the senior and family once). */
export const startTrip = (booking: string) => rpc("partner_start_trip", { _booking: booking });
export const claimRider = () => rpc<number>("claim_rider");
export const uploadAadhaar = (doc: string, name: string) => rpc("rider_upload_aadhaar", { _doc: doc, _name: name });
export const riderDocument = (id: string) => rpc<string | null>("rider_document", { _delivery_id: id });
export const setPresence = (online: boolean, p?: LatLng & { accuracy?: number }) =>
  rpc("set_presence", { _online: online, _lat: p?.lat ?? null, _lng: p?.lng ?? null, _accuracy: p?.accuracy ?? null });
export const riderFeed = () => rpc<FeedItem[]>("rider_feed");
export const respond = (booking: string, accept: boolean) => rpc("rider_respond", { _booking: booking, _accept: accept });
export const riderStatusUpdate = (booking: string, status: "out_for_delivery" | "completed") => rpc("rider_update_status", { _booking: booking, _status: status });
export const jobDetails = async (booking: string) => (await rpc<JobDetails[]>("job_details", { _booking: booking }))?.[0] ?? null;
export const trackBooking = async (booking: string) => (await rpc<Tracking[]>("track_booking", { _booking: booking }))?.[0] ?? null;

/** Current position once (for pinning a home or pickup point). */
export function currentPosition(): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("Location is not available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? "Location permission denied. Allow it in your browser or phone settings." : "Couldn't read your location. Check GPS and try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
