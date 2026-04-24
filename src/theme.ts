import type { AppSettings, ThemeName } from "./types";

export interface ThemeDefinition {
  name: string;
  background: string;
  panel: string;
  panelSoft: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  success: string;
  danger: string;
  shadow: string;
}

export const themeMap: Record<ThemeName, ThemeDefinition> = {
  "catppuccin-macchiato": {
    name: "Catppuccin Macchiato",
    background: "#1e2030",
    panel: "rgba(36, 39, 58, 0.86)",
    panelSoft: "rgba(54, 58, 79, 0.72)",
    border: "rgba(145, 215, 227, 0.16)",
    text: "#cad3f5",
    textMuted: "#a5adce",
    accent: "#8aadf4",
    accentSoft: "rgba(138, 173, 244, 0.16)",
    success: "#a6da95",
    danger: "#ed8796",
    shadow: "rgba(0, 0, 0, 0.38)",
  },
  "gruvbox-dark": {
    name: "Gruvbox Dark",
    background: "#1d2021",
    panel: "rgba(40, 40, 40, 0.9)",
    panelSoft: "rgba(60, 56, 54, 0.74)",
    border: "rgba(250, 189, 47, 0.16)",
    text: "#ebdbb2",
    textMuted: "#bdae93",
    accent: "#fabd2f",
    accentSoft: "rgba(250, 189, 47, 0.14)",
    success: "#b8bb26",
    danger: "#fb4934",
    shadow: "rgba(0, 0, 0, 0.44)",
  },
  sepia: {
    name: "Sepia",
    background: "#f4ead6",
    panel: "rgba(255, 250, 241, 0.92)",
    panelSoft: "rgba(241, 228, 198, 0.74)",
    border: "rgba(111, 78, 55, 0.12)",
    text: "#3d2c1f",
    textMuted: "#71543c",
    accent: "#b36a33",
    accentSoft: "rgba(179, 106, 51, 0.12)",
    success: "#5a7d4d",
    danger: "#aa3d2b",
    shadow: "rgba(120, 88, 54, 0.18)",
  },
  "solarized-light": {
    name: "Solarized Light",
    background: "#fdf6e3",
    panel: "rgba(255, 251, 239, 0.94)",
    panelSoft: "rgba(238, 232, 213, 0.72)",
    border: "rgba(38, 139, 210, 0.14)",
    text: "#586e75",
    textMuted: "#657b83",
    accent: "#268bd2",
    accentSoft: "rgba(38, 139, 210, 0.1)",
    success: "#859900",
    danger: "#dc322f",
    shadow: "rgba(88, 110, 117, 0.16)",
  },
};

export function applyTheme(settings: AppSettings) {
  const theme = themeMap[settings.theme];
  const root = document.documentElement;

  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-soft", theme.panelSoft);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--success", theme.success);
  root.style.setProperty("--danger", theme.danger);
  root.style.setProperty("--shadow", theme.shadow);
  root.style.setProperty("--font-size-base", `${settings.baseFontSize}px`);
  root.style.setProperty("--line-height-base", settings.lineHeight.toString());

  const typeFont = settings.typeFont === "fira-code" ? "Fira Code" : settings.typeFont === "geist-mono" ? "Geist Mono" : "JetBrains Mono";
  const readFont = settings.readFont === "merriweather" ? "Merriweather" : settings.readFont === "literata" ? "Literata" : "Inter";
  root.style.setProperty("--font-type", `${typeFont}, ui-monospace, monospace`);
  root.style.setProperty("--font-read", `${readFont}, Georgia, serif`);
}
