import { VaultState } from "./types";

const STORAGE_KEY = "pref_vault_state_v1";

export function loadState(): VaultState {
  if (typeof window === "undefined") {
    return defaultState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as VaultState;
    if (!parsed.version) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: VaultState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function defaultState(): VaultState {
  const categories = [
    {
      id: cryptoId(),
      name: "Identity",
      fields: [
        { id: cryptoId(), key: "full_name", label: "Full name", type: "text" },
        { id: cryptoId(), key: "email", label: "Email", type: "text" },
        { id: cryptoId(), key: "phone", label: "Phone", type: "text" },
      ],
    },
    {
      id: cryptoId(),
      name: "Address",
      fields: [
        { id: cryptoId(), key: "address.street", label: "Street", type: "text" },
        { id: cryptoId(), key: "address.city", label: "City", type: "text" },
        {
          id: cryptoId(),
          key: "address.state",
          label: "State",
          type: "dropdown",
          options: ["CA", "NY", "TX"],
        },
        { id: cryptoId(), key: "address.zip", label: "ZIP", type: "text" },
      ],
    },
  ];

  const profileId = cryptoId();

  return {
    version: 1,
    categories,
    profiles: [
      {
        id: profileId,
        name: "Personal",
        values: {
          full_name: "Jane Doe",
          email: "jane@example.com",
          phone: "555-555-5555",
          "address.street": "123 Main St",
          "address.city": "Los Angeles",
          "address.state": "CA",
          "address.zip": "90001",
        },
      },
    ],
    templates: [
      {
        id: cryptoId(),
        name: "Basic Contact Block",
        body:
          "Name: {{full_name}}\nEmail: {{email}}\nPhone: {{phone}}\nAddress: {{address.street}}, {{address.city}}, {{address.state}} {{address.zip}}\n",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    activeProfileId: profileId,
  };
}

export function cryptoId() {
  // browser-safe id
  return Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
}
