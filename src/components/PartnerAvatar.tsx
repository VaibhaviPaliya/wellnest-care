import { ChefHat, Cross } from "lucide-react";
import { useStore } from "@/lib/store";
import type { PartnerKind } from "@/lib/seed";

const HUES = [168, 24, 205, 280, 340, 45, 120];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Looks up the partner's uploaded photo in the demo data. */
export function usePartnerPhoto(kind: PartnerKind, id: string): string | undefined {
  const { db } = useStore();
  const list =
    kind === "coach"
      ? db.coaches
      : kind === "kitchen"
        ? db.kitchens
        : kind === "pharmacy"
          ? db.pharmacies
          : db.delivery;
  return (list as { id: string; photo?: string }[]).find((p) => p.id === id)?.photo;
}

/**
 * Photo of a coach, kitchen, pharmacy or delivery partner (FR3, FR7). Shows the photo the admin uploaded;
 * otherwise an illustrated avatar (never a real person's picture).
 */
export function PartnerAvatar({
  kind,
  id,
  name,
  size = 48,
  className = "",
}: {
  kind: PartnerKind;
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const photo = usePartnerPhoto(kind, id);
  const style = { width: size, height: size };
  const base = `shrink-0 overflow-hidden rounded-full border-2 border-card shadow-sm ${className}`;
  if (photo)
    return (
      <img src={photo} alt={`Photo of ${name}`} style={style} className={`${base} object-cover`} />
    );
  const hue = HUES[hash(id + name) % HUES.length];
  if (kind === "kitchen" || kind === "pharmacy") {
    const Icon = kind === "kitchen" ? ChefHat : Cross;
    return (
      <span
        role="img"
        aria-label={`${name} (illustration)`}
        style={{ ...style, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 55% 28%)` }}
        className={`${base} grid place-items-center`}
      >
        <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={1.8} />
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <svg
      role="img"
      aria-label={`${name} (illustrated avatar)`}
      viewBox="0 0 64 64"
      style={style}
      className={base}
    >
      <rect width="64" height="64" fill={`hsl(${hue} 55% 86%)`} />
      <circle cx="32" cy="25" r="12" fill={`hsl(${(hue + 25) % 360} 30% 62%)`} />
      <path d="M8 64c2-14 12-21 24-21s22 7 24 21z" fill={`hsl(${hue} 50% 38%)`} />
      <text
        x="32"
        y="58"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}

/** Reads an image file and shrinks it to a 160 px square JPEG data URL (a few KB) so it can sync between devices. */
export function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5_000_000)
      return reject(new Error("Choose a JPG, PNG or WebP image under 5 MB."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 160;
      canvas
        .getContext("2d")
        ?.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          160,
          160,
        );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    img.src = url;
  });
}
