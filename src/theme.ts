import type { AppFont, AppSettings, ThemeName } from "./types";
import { defaultSettings } from "./store/app-store";

export interface ThemeDefinition {
  name: string;
  background: string;
  panel: string;
  panelSoft: string;
  panelPopout: string;
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
    panelPopout: "rgba(36, 39, 58, 0.98)",
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
    panelPopout: "rgba(40, 40, 40, 0.98)",
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
    panelPopout: "rgba(255, 250, 241, 0.98)",
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
    panelPopout: "rgba(255, 251, 239, 0.98)",
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
    panelPopout: "rgba(34, 36, 48, 0.98)",
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
    panelPopout: "rgba(34, 44, 56, 0.98)",
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
    panelPopout: "rgba(54, 43, 43, 0.98)",
    border: "rgba(255, 183, 197, 0.15)",
    text: "#fce4ec",
    textMuted: "#b39393",
    accent: "#ffb1b1",
    accentSoft: "rgba(255, 177, 177, 0.18)",
    success: "#a8e6cf",
    danger: "#ff8b94",
    shadow: "rgba(0, 0, 0, 0.4)",
  },
  "mocha-blush": {
    name: "Mocha Blush",
    background: "#4e342e",
    panel: "rgba(93, 64, 55, 0.88)",
    panelSoft: "rgba(121, 85, 72, 0.72)",
    panelPopout: "rgba(93, 64, 55, 0.98)",
    border: "rgba(244, 143, 177, 0.16)",
    text: "#f8bbd0",
    textMuted: "#ba6b6c",
    accent: "#f48fb1",
    accentSoft: "rgba(244, 143, 177, 0.18)",
    success: "#81c784",
    danger: "#e57373",
    shadow: "rgba(38, 28, 25, 0.45)",
  },
  "nebula-drift": {
    name: "Nebula Drift",
    background: "#0a0b1e",
    panel: "rgba(15, 17, 45, 0.45)",
    panelSoft: "rgba(25, 28, 65, 0.12)",
    panelPopout: "rgba(15, 17, 45, 0.96)",
    border: "rgba(192, 132, 252, 0.02)",
    text: "#e0e0ff",
    textMuted: "#94a3b8",
    accent: "#c084fc",
    accentSoft: "rgba(192, 132, 252, 0.15)",
    success: "#4ade80",
    danger: "#f87171",
    shadow: "rgba(0, 0, 0, 0.5)",
  },
  "rainy-window": {
    name: "Rainy Window",
    background: "#1e293b",
    panel: "rgba(36, 39, 58, 0.45)",
    panelSoft: "rgba(54, 58, 79, 0.12)",
    panelPopout: "rgba(36, 39, 58, 0.96)",
    border: "rgba(102, 153, 155, 0.12)",
    text: "#f1f5f9cd",
    textMuted: "#94a3b8c6",
    accent: "#66999B",
    accentSoft: "rgba(102, 153, 155, 0.15)",
    success: "#2dd4bf",
    danger: "#fb7185",
    shadow: "rgba(0, 0, 0, 0.4)",
  },
  "satin-heart": {
    name: "Satin Heart",
    background: "#fff0f5",
    panel: "rgba(255, 255, 255, 0.55)",
    panelSoft: "rgba(255, 228, 235, 0.30)",
    panelPopout: "rgba(255, 248, 250, 0.97)",
    border: "rgba(220, 80, 120, 0.10)",
    text: "#4a2030",
    textMuted: "#9a6b7a",
    accent: "#e8375a",
    accentSoft: "rgba(232, 55, 90, 0.10)",
    success: "#3cb371",
    danger: "#e8375a",
    shadow: "rgba(180, 100, 130, 0.12)",
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
  root.style.setProperty("--panel-popout", theme.panelPopout);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  const successColor = settings.successColor && settings.successColor !== defaultSettings.successColor
    ? settings.successColor
    : theme.success;
  const errorColor = settings.errorColor && settings.errorColor !== defaultSettings.errorColor
    ? settings.errorColor
    : theme.danger;

  root.style.setProperty("--success", successColor);
  root.style.setProperty("--danger", errorColor);
  root.style.setProperty("--shadow", theme.shadow);
  root.style.setProperty("--font-size-base", `${settings.baseFontSize}px`);
  root.style.setProperty("--line-height-base", settings.lineHeight.toString());

  const appFont = fontFamilyMap[settings.font] ?? fontFamilyMap["jetbrains-mono"];
  root.style.setProperty("--font-main", `"${appFont}", ui-monospace, monospace`);
  root.setAttribute("data-theme", settings.theme);
}
