import { useId } from "react";

/**
 * WellNest logo mark ("Home & Smile"): a rounded home with a heart door, a smile and a leaf.
 * Inline SVG so it is sharp at every size; gradient ids are unique per instance.
 */
export function BrandMark({ size = 36, className = "", title }: { size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`wn-home-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#18B3A4" />
          <stop offset="1" stopColor="#2A6FB5" />
        </linearGradient>
        <linearGradient id={`wn-heart-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF9470" />
          <stop offset="1" stopColor="#E4572E" />
        </linearGradient>
      </defs>
      <path d="M60 18 L100 52 Q104 56 104 61 L104 94 Q104 104 94 104 L26 104 Q16 104 16 94 L16 61 Q16 56 20 52 Z" fill={`url(#wn-home-${id})`} />
      <path d="M78 37 C 77 25, 85 17, 96 16 C 97 28, 89 36, 78 37 Z" fill="#7FD9B0" />
      <path d="M80 35 C 84 29, 89 24, 94 20" fill="none" stroke="#18B3A4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M60 86 C 47 77, 41 69, 44 61 C 46 55, 55 54, 60 60 C 65 54, 74 55, 76 61 C 79 69, 73 77, 60 86 Z" fill={`url(#wn-heart-${id})`} />
      <path d="M34 80 C 38 92, 52 96, 60 96 C 68 96, 82 92, 86 80" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
