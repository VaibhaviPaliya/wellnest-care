import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useStore } from "@/lib/store";

/** Shows which pincode the partner lists are filtered by, or asks for one when the senior has none. */
export function ServiceArea({ what }: { what: string }) {
  const { me, senior } = useStore();
  if (!senior) return null;
  const editTo = me?.id === senior.id ? "/profile" : "/family";
  const whose = me?.id === senior.id ? "your" : `${senior.name.split(" ")[0]}’s`;
  if (!senior.pincode) return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="alert">
      <MapPin className="h-6 w-6 shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 basis-60"><strong>Add {whose} pincode</strong> to see {what} that serve {me?.id === senior.id ? "you" : "them"}. Only partners covering that pincode are shown.</p>
      <Link to={editTo} className="btn btn-primary">Add pincode</Link>
    </div>
  );
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <MapPin className="h-4 w-4 text-primary" />Showing {what} that serve <strong className="text-foreground">{senior.pincode}</strong>{senior.city ? ` (${senior.city})` : ""}
      <Link to={editTo} className="font-semibold text-primary underline-offset-4 hover:underline">Change address</Link>
    </p>
  );
}
