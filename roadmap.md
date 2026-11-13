# WellNest completion
## New care features
- [x] Admin-managed weekly exercise plans and prerecorded video links.
- [x] Demo exercise subscription: ₹1,999 / 30 days, eight sessions, no automatic renewal.
- [x] Therapy massage requests gated by professional approval.
- [x] Demonstration location map and family progress updates.
- [x] Calorie estimates, nutrition totals, local dabba/restaurant menus and customization review.
- [x] Behavior tests and desktop/mobile flow checks.
- [x] Complete consent, family access, and booking safeguards in the mock database.
- [x] Finish fitness scheduling, pharmacy review, payment cancellation, and admin order updates.
- [x] Check senior-friendly layouts and all three roles end to end.
- [x] Run existing and new behavior tests and compare supplied documents.

- [x] Timed daily reminders (medicine, exercise, meal, water) with family alerts, plus a one-hour heads-up before every booking.
- [x] Hindi language toggle (navigation, home, bookings, alerts, reminders and page titles; other screens fall back to English).
- [x] Star ratings aggregated from completed reviews for coaches, kitchens and pharmacies.

- [x] FR3/FR7 photos: coaches, kitchens, pharmacies and delivery partners show an uploaded photo or an illustrated avatar on listings, bookings and alerts.
- [x] FR8 delivery partners: admin verifies delivery staff; only verified staff are assigned, and unverifying someone reassigns their open orders.
- [x] FR2/FR7 two-phone demo sync: opt-in room code shares demo data between devices over a realtime channel (newest version wins; uploaded files stay on the device).
- [x] FR4/FR6/FR10: coach arrival window on home visits, "Paid" label, booking reminder 30 minutes before.

## Remaining document gaps
- Partner photos are illustrations until the admin uploads real ones.
- Two-phone sync is demo-grade (shared by room code, last writer wins); production needs bookings in Cloud tables with row-level security.
- Hindi covers the main navigation and screens only; forms and partner pages still need translation. Reminders fire only while the app is open (no push/SMS yet).
- Live online links open external meeting rooms; actual hosted classes and real-user timing studies remain unverified.

## Cloud migration
- [x] Real email OTP sign-in/registration with secure roles (admin not self-assignable).
- [ ] Real mobile SMS OTP — waiting on an SMS provider account (e.g. Twilio) and India DLT registration.
- [ ] Move bookings, partners, notifications and health data into Cloud.
- [ ] Branded code emails from your own domain.
