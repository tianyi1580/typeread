import type { AppFont, AppSettings, ThemeName } from "./types";

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
  dracula: {
    name: "Dracula",
    background: "#17181f",
    panel: "rgba(34, 36, 48, 0.9)",
    panelSoft: "rgba(52, 55, 71, 0.76)",
    border: "rgba(189, 147, 249, 0.18)",
    text: "#f8f8f2",
    textMuted: "#b9b6d3",
    accent: "#ffb86c",
    accentSoft: "rgba(255, 184, 108, 0.15)",
    success: "#50fa7b",
    danger: "#ff5555",
    shadow: "rgba(10, 10, 18, 0.4)",
  },
  nord: {
    name: "Nord",
    background: "#111922",
    panel: "rgba(34, 44, 56, 0.9)",
    panelSoft: "rgba(59, 74, 93, 0.72)",
    border: "rgba(136, 192, 208, 0.16)",
    text: "#e5eef6",
    textMuted: "#aab9cb",
    accent: "#88c0d0",
    accentSoft: "rgba(136, 192, 208, 0.14)",
    success: "#a3be8c",
    danger: "#bf616a",
    shadow: "rgba(6, 10, 16, 0.42)",
  },
  rosewood: {
    name: "Rosewood",
    background: "#2d2424",
    panel: "rgba(54, 43, 43, 0.88)",
    panelSoft: "rgba(74, 59, 59, 0.75)",
    border: "rgba(255, 183, 197, 0.15)",
    text: "#fce4ec",
    textMuted: "#b39393",
    accent: "#ffb1b1",
    accentSoft: "rgba(255, 177, 177, 0.18)",
    success: "#a8e6cf",
    danger: "#ff8b94",
    shadow: "rgba(0, 0, 0, 0.4)",
  },
  "sakura-tea": {
    name: "Sakura Tea",
    background: "#fff5f5",
    panel: "rgba(255, 255, 255, 0.94)",
    panelSoft: "rgba(255, 240, 240, 0.78)",
    border: "rgba(139, 115, 115, 0.12)",
    text: "#5d4037",
    textMuted: "#8d6e63",
    accent: "#f06292",
    accentSoft: "rgba(240, 98, 146, 0.12)",
    success: "#66bb6a",
    danger: "#ef5350",
    shadow: "rgba(139, 115, 115, 0.15)",
  },
  "mocha-blush": {
    name: "Mocha Blush",
    background: "#4e342e",
    panel: "rgba(93, 64, 55, 0.88)",
    panelSoft: "rgba(121, 85, 72, 0.72)",
    border: "rgba(244, 143, 177, 0.16)",
    text: "#f8bbd0",
    textMuted: "#ba6b6c",
    accent: "#f48fb1",
    accentSoft: "rgba(244, 143, 177, 0.18)",
    success: "#81c784",
    danger: "#e57373",
    shadow: "rgba(38, 28, 25, 0.45)",
  },
};

const DEFAULT_THEME_NAME: ThemeName = "catppuccin-macchiato";

const fontFamilyMap: Record<AppFont, string> = {
  "jetbrains-mono": "JetBrains Mono",
  "fira-code": "Fira Code",
  "geist-mono": "Geist Mono",
};

export function applyTheme(settings: AppSettings) {
  const theme = themeMap[settings.theme] ?? themeMap[DEFAULT_THEME_NAME];
  const root = document.documentElement;

  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-soft", theme.panelSoft);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--success", settings.successColor || theme.success);
  root.style.setProperty("--danger", settings.errorColor || theme.danger);
  root.style.setProperty("--shadow", theme.shadow);
  root.style.setProperty("--font-size-base", `${settings.baseFontSize}px`);
  root.style.setProperty("--line-height-base", settings.lineHeight.toString());

  const appFont = fontFamilyMap[settings.font] ?? fontFamilyMap["jetbrains-mono"];
  root.style.setProperty("--font-main", `"${appFont}", ui-monospace, monospace`);
}
