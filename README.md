# MyFormsVault

MyFormsVault is a local-first form and template workflow made of two parts:

- A Next.js web app for managing profiles, categories, fields, and templates.
- A Chrome extension for inserting saved values, learning site-specific mappings, and filling mapped fields.

The current implementation keeps user data on-device:

- The web app stores vault data in `localStorage`.
- The extension stores synced vault state and mappings in `chrome.storage.local`.

## Features

- Structured vault data: profiles, categories, and fields.
- Template rendering with `{{field.key}}` placeholders.
- JSON export/import so data stays portable.
- Quick field insert and template paste from the extension.
- Learned per-site mappings for repeat form filling.
- Auto-suggested mappings with user-controlled caution levels:
  `Conservative`, `Balanced`, and `Aggressive`.
- Basic form-type detection for common flows such as login, checkout, contact, and job application forms.

## Repository Layout

```text
MyFormsVault/
  extension/   Chrome extension (Manifest V3)
  web/         Next.js web app
```

## Local Development

### Web app

```bash
cd web
npm install
npm run dev
```

Default dev URL:

```text
http://localhost:3000
```

### Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` folder from this repository.

## Live Sync

The web app posts the current vault state to the extension so the popup can use fresh data without manual JSON copy/paste.

Current allowed dev origins:

- `http://localhost:3000`
- `http://127.0.0.1:3000`

If you run the web app on another origin, update both of these files:

- `web/src/lib/extensionSync.ts`
- `extension/content.js`

## Extension Workflow

1. Open the web app and edit your vault.
2. Open a site with a form.
3. Use the extension popup to:
   - insert a single field value,
   - copy a field value,
   - learn a field mapping for the current site,
   - fill all mapped fields,
   - paste rendered template output.

## Packaging

The Chrome extension package should be built from the contents of `extension/` with these top-level files:

- `manifest.json`
- `popup.html`
- `popup.js`
- `content.js`
- `styles.css`
- `icons/`

