import { VaultState } from "./types";

let t: number | null = null;

export function syncToExtension(state: VaultState) {
  // Debounce
  if (t) window.clearTimeout(t);

  t = window.setTimeout(() => {
    window.postMessage(
      { type: "PV_SYNC_STATE", payload: state },
      "http://localhost:3000"
    );
  }, 250);
}
