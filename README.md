# Form Autofill Suite (New App)

A standalone app for saving reusable personal data templates and autofilling website forms.

## Project structure

- `backend/`: API server (TypeScript + Express + SQLite)
- `extension/`: Chrome extension (Manifest V3)

## Features (MVP)

- Email/password account registration and login
- JWT auth
- Save/list/delete form templates
- Per-site mapping profiles (`targetField=templateField`)
- Capture current page form values into a template
- Autofill active page fields from a selected template
- Best-match site mapping selection based on active URL wildcard patterns

## 1) Run backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend default URL: `http://localhost:8787`

## 2) Load extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

## 3) Use flow

1. Open the extension popup
2. Confirm backend URL is `http://localhost:8787`
3. Register or log in
4. On any website form, fill a few fields manually
5. Enter a template name in popup and click **Save current page values**
6. Open another similar form and click **Fill current page**
7. Optional: create site mapping profile (e.g., `given_name=firstname`) for harder forms

## API endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/templates`
- `POST /api/templates`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`
- `GET /api/templates/:id/mappings`
- `POST /api/templates/:id/mappings`
- `PUT /api/mappings/:id`
- `DELETE /api/mappings/:id`

## Notes

- Data is stored locally in `backend/data/app.db`.
- Password fields are intentionally ignored by the extension for safety.
- Site pattern examples: `example.com/*`, `jobs.example.com/apply/*`, `https://foo.bar/form/*`
- This is a baseline MVP; next step is encrypted template storage + cloud sync.
