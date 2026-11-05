# SPS ERP frontend

Next.js school management frontend: sign-in screens, dashboard and every
module screen (people, teaching, assessment, finance, operations). It runs with
the rest of the stack via `docker compose up`; see the [root README](../README.md).

## Where things are

- `app/(auth)` — login, forgot/reset password, two-factor, verify email, invitations
- `app/(app)` — the signed-in app: dashboard, attendance, profile, settings, reports, logs
- `app/(app)/[resource]` — list, record, create and edit screens for every module
- `lib/resources.ts` — each module's columns, form fields and demo rows
- `lib/nav.ts` — the sidebar menu and Ctrl+K search entries
- `components/ui` — buttons, cards, form controls, tables, dialogs, charts

## Demo data

The screens read seeded demo data from `lib/mock.ts` and `lib/resources.ts`;
saving shows a confirmation but does not reach the backend yet. To connect a
module, replace its `rows` in `lib/resources.ts` with a call to the API.

Design adapted from Skuul (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
