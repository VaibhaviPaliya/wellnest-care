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
- Use the shared Button care variants for existing large-text controls, and Radix dialogs for focus management and scrollable mobile overlays.
