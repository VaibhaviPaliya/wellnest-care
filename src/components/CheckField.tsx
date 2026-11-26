import type { ReactNode } from "react";

/** The app's one checkbox style. `card` gives the boxed look used for consent items. */
export function CheckField({ checked, onChange, children, card = false, className = "", disabled }: {
  checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; card?: boolean; className?: string; disabled?: boolean;
}) {
  return (
    <label className={`check-row ${card ? "check-card" : ""} ${className}`}>
      <input type="checkbox" className="check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
