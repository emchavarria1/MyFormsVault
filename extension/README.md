# Extension Notes

## Files

- `manifest.json`: extension manifest
- `src/popup.html|css|js`: popup UI and backend integration
- `src/content.js`: form field capture and autofill logic

## Site Mappings

- A mapping profile is scoped to a selected template.
- `sitePattern` uses `*` wildcards (example: `example.com/forms/*`).
- Field map format in popup is one line per pair:
  - `target_field_key=template_field_key`
  - Example: `givenname=firstname`
- During fill, the extension selects the most specific pattern matching the active tab URL.

## Permissions used

- `storage`: token/API URL storage
- `tabs`, `activeTab`: send capture/fill messages to active page
- `<all_urls>` host access: allow content script on websites

## Security behavior

- The content script skips password fields.
- Auth token is stored in `chrome.storage.local` for convenience in MVP.
