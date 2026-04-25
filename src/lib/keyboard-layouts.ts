import type { AppSettings, KeyboardLayoutDefinition, KeyboardLayoutId } from "../types";

export const keyboardLayoutPresets: Record<Exclude<KeyboardLayoutId, "custom">, KeyboardLayoutDefinition> = {
  "qwerty-us": {
    id: "qwerty-us",
    name: "QWERTY (US)",
    rows: ["1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"],
  },
  colemak: {
    id: "colemak",
    name: "Colemak",
    rows: ["1234567890-=", "qwfpgjluy;[]\\", "arstdhneio'", "zxcvbkm,./"],
  },
  dvorak: {
    id: "dvorak",
    name: "Dvorak",
    rows: ["1234567890[]", "',.pyfgcrl/=", "aoeuidhtns-", ";qjkxbmwvz"],
  },
};

export function parseKeyboardLayoutRows(source: string) {
  return source
    .split(/\r?\n/)
    .map((row) => row.replace(/\s+/g, "").trim().toLowerCase())
    .filter(Boolean);
}

export function resolveKeyboardLayout(settings: AppSettings): KeyboardLayoutDefinition {
  if (settings.keyboardLayout === "custom") {
    const rows = parseKeyboardLayoutRows(settings.customKeyboardLayout);
    if (rows.length >= 3) {
      return {
        id: "custom",
        name: "Custom Layout",
        rows,
      };
    }
  }

  return keyboardLayoutPresets[settings.keyboardLayout as Exclude<KeyboardLayoutId, "custom">] ?? keyboardLayoutPresets["qwerty-us"];
}

export function normalizeKeyLabel(value: string) {
  if (value === " ") {
    return "space";
  }

  if (value === "\n") {
    return "enter";
  }

  return value.toLowerCase();
}
