import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageTitle, Shell, UpiCheckout } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { isSuitable, whyItSuits } from "@/lib/rules";
import { CONDITION_LABEL, DIET_LABEL, TAG_LABEL } from "@/lib/seed";
import { MealExtras } from '@/components/CareFeatures';
import { calorieTarget } from '@/lib/care';
import { RatingBadge } from '@/components/RatingBadge';

export const Route = createFileRoute("/meals")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Health-Suitable Meals | WellNest" },
      { name: "description", content: "Meals from verified partner kitchens, filtered by your health profile — low sugar, low sodium, low oil, soft food." },
      { property: "og:title", content: "Health-Suitable Meals | WellNest" },
      { property: "og:description", content: "Dishes that suit your health, delivered home." },
    ],
  }),
  component: () => <Shell roles={["senior", "family"]}><Meals /></Shell>,
});

function Meals() {
  const { db, senior, createBooking } = useStore();
  const nav = useNavigate();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [kitchen, setKitchen] = useState<string>("all");
  const [slot, setSlot] = useState("13:00");
  const [pay, setPay] = useState(false);
  const [source, setSource] = useState<'all' | 'dabba' | 'restaurant'>('all');
  const [sort, setSort] = useState<'default' | 'calories'>('default');
  const h = senior?.health;
  if (!h || !senior?.consent?.given) return <p className="surface p-6 text-lg">This senior needs to complete their consent and health profile first. <Link to="/home" className="text-primary underline">Go home</Link></p>;

  const kitchens = db.kitchens.filter((k) => k.verified);
  const target = h.metrics ? calorieTarget(h.metrics) : null;
  const dishes = db.dishes.filter((d) => kitchens.some((k) => k.id === d.kitchenId && (source === 'all' || k.kind === source)) && isSuitable(d, h) && (kitchen === "all" || d.kitchenId === kitchen)).sort((a,b) => sort === 'calories' && target ? Math.abs((a.nutrition?.calories ?? Infinity) - target / 3) - Math.abs((b.nutrition?.calories ?? Infinity) - target / 3) : 0);
  const items = Object.entries(cart).filter(([, q]) => q > 0).flatMap(([id, qty]) => {
    const d = db.dishes.find((x) => x.id === id);
    return d && isSuitable(d, h) && kitchens.some((k) => k.id === d.kitchenId) ? [{ d, qty }] : [];
  });
  const total = items.reduce((s, i) => s + i.d.price * i.qty, 0) + (items.length ? 30 : 0);
  const kitchenIds = [...new Set(items.map((i) => i.d.kitchenId))];
  const add = (id: string, n: number) => {
    const d = db.dishes.find((x) => x.id === id);
    if (!d) return;
    if (n > 0 && kitchenIds.length && !kitchenIds.includes(d.kitchenId)) return toast.error("Please order from one kitchen at a time.");
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + n) }));
  };
  const kName = (id: string) => db.kitchens.find((k) => k.id === id)?.name ?? "";

  return (
    <>
      <PageTitle title="Health-Suitable Meals" sub={`Showing only dishes that suit ${senior.name.split(" ")[0]}: ${[...h.conditions.map((c) => CONDITION_LABEL[c]), DIET_LABEL[h.diet]].join(" · ")}`} />
      <MealExtras />
      <div className="mb-4 flex flex-wrap gap-3"><label className="font-bold">Meal source<select className="field" value={source} onChange={e => { setSource(e.target.value as typeof source); setKitchen('all'); }}><option value="all">All sources</option><option value="dabba">Local dabba kitchens</option><option value="restaurant">Restaurants</option></select></label><label className="font-bold">Order by<select className="field" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="default">Kitchen menu</option><option value="calories" disabled={!target}>Closest to one-third daily estimate</option></select></label></div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="care" size="care" className="chip" aria-pressed={kitchen === "all"} onClick={() => setKitchen("all")}>All kitchens</Button>
        {kitchens.map((k) => <Button variant="care" size="care" key={k.id} className="chip" aria-pressed={kitchen === k.id} onClick={() => setKitchen(k.id)}>{k.name}</Button>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {dishes.map((d) => (
            <li key={d.id} className="surface flex flex-col p-5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-muted-foreground"><span className="flex items-center gap-1"><BadgeCheck className="h-4 w-4 text-success" />{kName(d.kitchenId)}</span><RatingBadge type="meal" partnerId={d.kitchenId} /></p>
              <h2 className="mt-1 text-xl font-bold">{d.name}</h2>
              <p className="text-muted-foreground">{d.desc}</p>
              <p className="mt-2 text-sm font-bold">{d.nutrition ? `${d.nutrition.calories} kcal · ${d.nutrition.carbs} g carbs · ${d.nutrition.protein} g protein / serving` : 'Nutrition per serving awaiting kitchen data'}</p>
              <div className="mt-2 flex flex-wrap gap-1">{d.tags.map((t) => <span key={t} className="tag">{TAG_LABEL[t]}</span>)}</div>
              <div className="mt-3 rounded-xl bg-tile-fit p-3">
                <p className="flex items-center gap-1 font-bold"><Sparkles className="h-4 w-4 text-primary" />Why this suits you</p>
                <ul className="mt-1 list-disc pl-5">{whyItSuits(d, h).map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              <div className="mt-4 flex flex-1 items-end justify-between">
                <span className="font-display text-2xl font-bold">₹{d.price}</span>
                {cart[d.id] ? (
                  <div className="flex items-center gap-2">
                    <Button variant="care" size="care" className="btn btn-outline min-h-11 px-3" aria-label="Remove one" onClick={() => add(d.id, -1)}><Minus className="h-5 w-5" /></Button>
                    <span className="w-6 text-center text-xl font-bold">{cart[d.id]}</span>
                    <Button variant="care" size="care" className="btn btn-primary min-h-11 px-3" aria-label="Add one" onClick={() => add(d.id, 1)}><Plus className="h-5 w-5" /></Button>
                  </div>
                ) : <Button variant="care" size="care" className="btn btn-primary" onClick={() => add(d.id, 1)}>Add</Button>}
              </div>
            </li>
          ))}
          {dishes.length === 0 && <p className="surface p-6 text-lg sm:col-span-2">No dishes match this health profile right now.</p>}
        </ul>

        <aside className="surface h-fit p-5 lg:sticky lg:top-24">
          <h2 className="text-2xl font-bold">Your order</h2>
          {items.length === 0 ? <p className="mt-2 text-muted-foreground">Add dishes to begin.</p> : (
            <>
              <p className="mt-1 text-muted-foreground">{kName(kitchenIds[0])}</p>
              <p className="mt-2 font-bold">{items.every(i => i.d.nutrition) ? `${items.reduce((n,i) => n + (i.d.nutrition?.calories ?? 0) * i.qty, 0)} kcal · ${items.reduce((n,i) => n + (i.d.nutrition?.carbs ?? 0) * i.qty, 0)} g carbs · ${items.reduce((n,i) => n + (i.d.nutrition?.protein ?? 0) * i.qty, 0)} g protein` : 'Nutrition total unavailable: some servings have no data'}</p>
              <ul className="mt-3 space-y-2">{items.map((i) => <li key={i.d.id} className="flex justify-between gap-2"><span>{i.qty} × {i.d.name}</span><span className="font-bold">₹{i.d.price * i.qty}</span></li>)}</ul>
              <p className="mt-2 flex justify-between text-muted-foreground"><span>Delivery</span><span>₹30</span></p>
              <p className="mt-2 flex justify-between border-t-2 pt-2 text-xl font-bold"><span>Total</span><span>₹{total}</span></p>
              <p className="mb-2 mt-4 font-bold">Deliver at</p>
              <p className="mb-2 text-muted-foreground">{(() => { const d = new Date(); const [hour, minute] = slot.split(":").map(Number); d.setHours(hour, minute, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }); })()}</p>
              <div className="flex flex-wrap gap-2">{["08:30", "13:00", "19:30"].map((s) => <Button variant="care" size="care" key={s} className="chip" aria-pressed={slot === s} onClick={() => setSlot(s)}>{s === "08:30" ? "Breakfast" : s === "13:00" ? "Lunch" : "Dinner"} {s}</Button>)}</div>
              <Button variant="care" size="care" className="btn btn-accent mt-5 w-full" onClick={() => setPay(true)}>Pay ₹{total} with UPI</Button>
            </>
          )}
        </aside>
      </div>

      <UpiCheckout open={pay} amount={total} title={`Meal from ${kName(kitchenIds[0] ?? "")}`}
        onClose={() => setPay(false)}
        onDone={() => { setPay(false); setCart({}); nav({ to: "/activity" }); }}
        onPaid={() => {
          if (!items.length) throw new Error("Your cart is empty. Please choose a suitable dish.");
          const w = new Date(); const [hh, mm] = slot.split(":").map(Number); w.setHours(hh, mm, 0, 0); if (w < new Date()) w.setDate(w.getDate() + 1);
          createBooking({ type: "meal", title: `${slot === "08:30" ? "Breakfast" : slot === "13:00" ? "Lunch" : "Dinner"} from ${kName(kitchenIds[0]).split(" ")[0]}`, partnerId: kitchenIds[0], partnerName: kName(kitchenIds[0]), amount: total, when: w.toISOString(), detail: `${items.length} item(s)`, items: items.map((i) => ({ name: i.d.name, qty: i.qty, price: i.d.price })) });
          toast.success("Order placed! Family members have been alerted.");
        }} />
    </>
  );
}
