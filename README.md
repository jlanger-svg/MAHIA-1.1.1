# Audi Hampton Inventory Administrator

Desktop administration companion for the Audi Hampton physical inventory app. It uses the same Supabase project and shared audit tables.

Version 1.1 adds a session-based administrator lock screen. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify before building.

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`

The GitHub source ZIP is intentionally flat: upload every file directly to the repository root.
