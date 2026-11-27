import { Star } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { ratingOf } from "@/lib/reviews";
import type { Booking } from "@/lib/seed";

/** Average star rating from completed, reviewed bookings for a kitchen, pharmacy or coach. */
export function RatingBadge({
  type,
  partnerId,
  fallback = 0,
  className = "",
}: {
  type: Booking["type"];
  partnerId: string;
  fallback?: number;
  className?: string;
}) {
  const { db } = useStore();
  const { t } = useT();
  const listing = [...db.coaches, ...db.kitchens, ...db.pharmacies].find((p) => p.id === partnerId);
  const { avg: rating, count } = ratingOf(listing, db.bookings, type, partnerId, fallback);
  if (!rating)
    return (
      <span className={`text-sm text-muted-foreground ${className}`}>
        {t("New partner · no reviews yet")}
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${className}`}
      aria-label={`Rated ${rating} out of 5`}
    >
      <Star className="h-4 w-4 fill-warn text-warn" aria-hidden />
      {rating.toFixed(1)}
      <span className="font-normal text-muted-foreground">
        · {count === 1 ? t("1 review") : t("{count} reviews", { count })}
      </span>
    </span>
  );
}
