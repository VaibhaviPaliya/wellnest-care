<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Email sign-in, profiles and roles live in Lovable Cloud (profiles, user_roles, choose_role RPC that never grants admin); bookings/partners/notices remain in the localStorage mock DB in src/lib/store.tsx until migrated, keyed by the Cloud user id. Why: real OTP needs server-verified identity; full data migration is phased.
- Enforce role, consent, ownership, scheduling and status-transition rules in the mock store as well as screen guards so every flow uses the same safeguards; this is a test-data prototype, not production authentication.
- Keep booking lifecycle and availability rules in a browser-safe shared module so user and admin views cannot disagree.
- Keep the root package.json dependency manifest and dev/build/build:dev scripts tracked; deployment uses them to install dependencies and build the app.
- Keep care plans, subscription credits, review requests and nutrition validation in the shared mock store and browser-safe care module; no clinical or tracking claims derive from demo state. Why: every screen must enforce the same consent and ownership gates.
- Use the shared Button care variants for existing large-text controls, and Radix dialogs for focus management and scrollable mobile overlays.
- Account deletion requires a fresh approval code (emailed for Cloud users, demo code otherwise); Cloud sign-ins are removed via an authenticated server function, and the last admin cannot be deleted. Why: deletion is irreversible and must prove account ownership.

- Reminders and booking heads-ups live in the shared mock store (care.reminders, care.bookingAlerts) and are fired by ReminderRunner in Shell every 30 s; firing is recomputed inside the state update so overlapping ticks never duplicate alerts. Reminders are removed with health data deletion.
- UI text is translated with useT()/t(english) from src/lib/i18n.tsx; English strings are the keys and missing Hindi entries fall back to English, so wrap new UI strings in t() and add a HI entry.
- Partner pictures come from PartnerAvatar: an admin-uploaded photo (resized to a 160 px JPEG data URL, max 60 KB) or an illustrated avatar; never real people's images by default.
- Meal and medicine orders get a verified delivery partner from assignDelivery(); unverified staff are never assigned and unverifying reassigns open orders.
- Two-phone sync (src/lib/sync.ts) is opt-in per device with a room code; it broadcasts the shared demo data (not sign-in, not uploaded files) and the newest updatedAt wins. Only shared-data changes bump updatedAt. Why: a demo needs senior and family on separate phones before bookings move to Cloud tables.
- Data lives in Lovable Cloud (migration drizzle/migrations/0001_care_data_in_cloud.sql): profiles (+address, consent_at, health), family_links, catalog (partners, dishes, plans), bookings, notices, care_items, all with row-level security; health is returned only to the senior and linked family via visible_people(). Why: a senior and family on different phones must share data, and payments later need server-verified records.
- Every sign-in is a Cloud session. Mobile numbers still use the demo code 123456, checked by the server function demoPhoneSignIn (src/lib/cloud.functions.ts), which creates the account and seeds shared demo data once (src/lib/cloud.server.ts). A number saved on an email account cannot be opened this way.
- The store keeps its rules and in-memory model; src/lib/cloud.ts loads what RLS allows and turns each local change into inserts/updates/deletes (planWrites). New bookings are inserted, never upserted, because the bookings trigger checks the booker, verified partner, future time and double booking on insert.
- SQL rules are tested against real Postgres with a Supabase auth stub (48 checks); keep those passing when changing policies. The old two-phone room sync (src/lib/sync.ts, SyncSettings) is retired.
- "Continue with Google" uses Lovable Cloud managed Google sign-in via @lovable.dev/cloud-auth-js (src/lib/google.ts): full-page redirect on the published site, pop-up inside the editor preview. New Google users land in pendingCloud and finish the normal registration (name pre-filled from Google). Google must be switched on in Lovable Cloud: More → Users → Settings → Google.
- Partners (pharmacy, kitchen, coach) self-register with the partner role; submit_partner always saves pending + unverified and only admins approve. Customers see only verified partners whose servicePincodes include the senior's pincode (online-only coaching excepted); check_booking enforces the same in Cloud. Why: unverified or out-of-area partners must never be bookable.
- Addresses are structured (street line in `address`, plus pincode, city, state); the state is guessed from the pincode prefix and the city looked up from India Post on the server, both editable.
- Stores and kitchens list their own riders (delivery role, linked by mobile). Riders upload only a MASKED Aadhaar into rider_private (rider + admins only; never selected in normal loads, never in realtime). Rider phone/identity fields must never be written to the shared catalogue (publicRider strips them). Why: Aadhaar Act / DPDP — minimise identity data.
- Rider assignment for stores with their own riders is server-side only (dispatch_booking: least-busy online rider nearest the pickup, 60 s offers). Customers may only cancel; progress and rider changes go through partner_/rider_ functions (check_booking enforces). Why: the browser must not pick or impersonate riders.
- Live location is foreground-only (page open) via set_presence; customers read it only through track_booking for their own active bookings. Coaches share from 3 h before a home visit.
- PWA: public/manifest.json + public/sw.js. The service worker never caches HTML pages or anything cross-origin (Cloud, payments, maps); it caches only /assets/*, icons and fonts, and shows /offline.html when offline. It is not registered in dev or inside the Lovable preview iframe. Bump VERSION in sw.js to force installed copies to refresh. Why: stale pages after a deploy, or cached private data, would be worse than no caching.
