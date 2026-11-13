import { Star } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { partnerRating } from "@/lib/care";
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
  const { rating, count } = partnerRating(type, partnerId, db.bookings, fallback);
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
