import { type ReactNode, useEffect, useMemo, useState } from "react";
import { keyboardLayoutPresets } from "../lib/keyboard-layouts";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ColorPicker } from "./ui/color-picker";
import { themeMap } from "../theme";
import { cn, clamp } from "../lib/utils";
import { api } from "../lib/tauri";
import type { AppSettings, AppFont, ProfileProgress, ThemeName } from "../types";

type SettingsSection = "appearance" | "reading" | "storage";

/**
 * Properties for the SettingsView component.
 */
interface SettingsViewProps {
  /** Whether the settings modal is open. */
  isOpen: boolean;
  /** Current application settings. */
  settings: AppSettings;
  /** User's profile progress (for unlocks). */
  profile: ProfileProgress | null;
  /** Whether the Tauri backend is ready. */
  desktopReady: boolean;
  /** Callback to close the settings. */
  onClose: () => void;
  /** Callback when settings change. */
  onChange: (settings: AppSettings) => void;
  /** Callback to export the database. */
  onExportDatabase: () => void;
  /** Callback to import a database. */
  onImportDatabase: () => void;
  /** Callback to clear session history. */
  onClearSessionHistory: () => void;
  /** Callback to delete the library. */
  onDeleteLibrary: () => void;
  /** Callback to refresh data from the backend. */
  onRefresh: () => Promise<void>;
}


export function SettingsView({
  isOpen,
  settings,
  profile,
  desktopReady,
  onClose,
  onChange,
  onExportDatabase,
  onImportDatabase,
  onClearSessionHistory,
  onDeleteLibrary,
  onRefresh,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");
  const themeEntries = useMemo(() => Object.entries(themeMap) as Array<[ThemeName, (typeof themeMap)[ThemeName]]>, []);
  const defaultUnlocks = {
    draculaTheme: false,
    nordTheme: false,
    rosewoodTheme: false,
    mochaBlushTheme: false,
    nebulaDriftTheme: true,
    rainyWindowTheme: true,
    velvetMercuryTheme: true,
    smoothCaret: false,
    premiumTypography: false,
    customErrorColors: false,
    customSuccessColors: false,
  };
  const unlocks = { ...defaultUnlocks, ...profile?.unlocks };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <button type="button" aria-label="Close settings" className="absolute inset-0" onClick={onClose} />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative grid h-[min(860px,88vh)] w-full max-w-[1180px] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] !bg-[var(--panel-popout)]"
      >
        <aside className={cn(
          "border-r border-[var(--border)] p-5",
          settings.theme === "rainy-window" || settings.theme === "nebula-drift" || settings.theme === "velvet-mercury"
            ? "bg-[color-mix(in_srgb,var(--bg)_98%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--panel-soft)_80%,transparent)]"
        )}>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={onClose}
              className="w-fit text-xs uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              Close
            </button>
            <h2 id="settings-title" className="mt-5 text-center text-2xl font-semibold">Settings</h2>
          </div>

          <nav className="mt-6 space-y-2">
            <SidebarButton active={section === "appearance"} onClick={() => setSection("appearance")}>
              Appearance
            </SidebarButton>
            <SidebarButton active={section === "reading"} onClick={() => setSection("reading")}>
              Reading & Typing
            </SidebarButton>
            <SidebarButton active={section === "storage"} onClick={() => setSection("storage")}>
              Data & Storage
            </SidebarButton>
          </nav>
        </aside>

        <div className={cn(
          "overflow-y-auto p-6 lg:p-8",
          settings.theme === "rainy-window" || settings.theme === "nebula-drift" || settings.theme === "velvet-mercury" ? "bg-[var(--panel-popout)]" : ""
        )}>
          {section === "appearance" && (
            <div className="space-y-8">
              <SectionTitle
                title="Appearance"
                description="Customize your interface and typography."
              />

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)]">Premium Themes</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {themeEntries.map(([key, theme]) => {
                    const locked =
                      (key === "dracula" && !unlocks.draculaTheme) ||
                      (key === "nord" && !unlocks.nordTheme) ||
                      (key === "rosewood" && !unlocks.rosewoodTheme) ||
                      (key === "mocha-blush" && !unlocks.mochaBlushTheme) ||
                      (key === "nebula-drift" && !unlocks.nebulaDriftTheme) ||
                      (key === "rainy-window" && !unlocks.rainyWindowTheme) ||
                      (key === "velvet-mercury" && !unlocks.velvetMercuryTheme);

                    const getThemeLevel = (themeKey: string) => {
                      if (themeKey === "dracula" || themeKey === "rosewood") return 10;
                      if (themeKey === "nord" || themeKey === "mocha-blush") return 15;
                      if (themeKey === "nebula-drift") return 20;
                      if (themeKey === "rainy-window") return 25;
                      if (themeKey === "velvet-mercury") return 30;
                      return 0;
                    };

                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={locked}
                        onClick={() => onChange({ ...settings, theme: key })}
                        className={cn(
                          "liquid-glass-soft group relative rounded-[28px] p-4 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-55",
                          settings.theme === key 
                            ? "border-[var(--accent)] scale-[1.02] !shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_30%,transparent)] z-10" 
                            : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:scale-[1.01]"
                        )}
                      >
                        <div className="grid grid-cols-4 gap-1.5">
                          <span className="h-10 rounded-xl shadow-inner transition-transform group-hover:scale-105" style={{ background: theme.background }} />
                          <span className="h-10 rounded-xl shadow-inner transition-transform group-hover:scale-105" style={{ background: theme.panel }} />
                          <span className="h-10 rounded-xl shadow-inner transition-transform group-hover:scale-105" style={{ background: theme.accent }} />
                          <span className="h-10 rounded-xl shadow-inner transition-transform group-hover:scale-105" style={{ background: theme.text }} />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <p className={cn(
                            "text-sm font-black transition-colors",
                            settings.theme === key ? "text-[var(--accent)]" : "group-hover:text-[var(--accent)]"
                          )}>{theme.name}</p>
                          {locked && <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Lvl {getThemeLevel(key)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)]">Typography & Motion</p>
                <div className="liquid-glass-soft space-y-8 rounded-[32px] p-8">
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Select Font</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <FontPreviewCard
                        label="JetBrains Mono"
                        value="jetbrains-mono"
                        active={settings.font === "jetbrains-mono"}
                        sample="The quick brown fox hits 87 WPM."
                        onClick={(font) => onChange({ ...settings, font })}
                      />
                      <FontPreviewCard
                        label="Fira Code"
                        value="fira-code"
                        active={settings.font === "fira-code"}
                        sample="Pack my box with five dozen liquor jugs."
                        locked={!unlocks.premiumTypography}
                        lockLabel="Lvl 15"
                        onClick={(font) => onChange({ ...settings, font })}
                      />
                      <FontPreviewCard
                        label="Geist Mono"
                        value="geist-mono"
                        active={settings.font === "geist-mono"}
                        sample="Sphinx of black quartz, judge my vow."
                        onClick={(font) => onChange({ ...settings, font })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-8 md:grid-cols-2">
                    <SliderField
                      label="Base Font Size"
                      value={settings.baseFontSize}
                      min={14}
                      max={24}
                      step={1}
                      format={(value) => `${value}px`}
                      onChange={(value) => onChange({ ...settings, baseFontSize: clamp(Math.round(value), 14, 24) })}
                    />

                    <SliderField
                      label="Line Spacing"
                      value={settings.lineHeight}
                      min={1.2}
                      max={2}
                      step={0.05}
                      format={(value) => value.toFixed(2)}
                      onChange={(value) => onChange({ ...settings, lineHeight: clamp(Number(value.toFixed(2)), 1.2, 2) })}
                    />
                  </div>

                  <ToggleRow
                    label="Smooth Caret"
                    description="Unlocked at level 5. Keeps the caret motion less harsh during dense typing runs."
                    checked={settings.smoothCaret}
                    disabled={!unlocks.smoothCaret}
                    theme={settings.theme}
                    onChange={(checked) => onChange({ ...settings, smoothCaret: checked })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)]">Interface Colors</p>
                <div className="liquid-glass-soft space-y-6 rounded-[32px] p-8">
                  <div className="grid gap-6 md:grid-cols-2">
                    <ColorPicker
                      label="Error Highlight Color"
                      value={settings.errorColor}
                      disabled={!unlocks.customErrorColors}
                      levelLabel="Lvl 10"
                      onChange={(color) => onChange({ ...settings, errorColor: color })}
                    />
                    <div className="flex flex-col justify-end">
                      <span className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Live Preview</span>
                      <div className="liquid-glass-soft flex h-14 items-center rounded-[20px] px-6">
                        <p className="text-sm font-medium" style={{ fontFamily: `var(--font-main)` }}>
                          Sphinx of black <span className="rounded-sm px-0.5" style={{ backgroundColor: `${settings.errorColor}33`, color: settings.errorColor, borderBottom: `2px solid ${settings.errorColor}` }}>quartz</span>, judge my vow.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <ColorPicker
                      label="Correct Character Color"
                      value={settings.successColor}
                      disabled={!unlocks.customSuccessColors}
                      levelLabel="Lvl 2"
                      onChange={(color) => onChange({ ...settings, successColor: color })}
                    />
                    <div className="flex flex-col justify-end">
                      <span className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Live Preview</span>
                      <div className="liquid-glass-soft flex h-14 items-center rounded-[20px] px-6">
                        <p className="text-sm font-medium" style={{ fontFamily: `var(--font-main)` }}>
                          Sphinx of <span style={{ color: settings.successColor }}>black quartz</span>, judge my vow.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === "reading" && (
            <div className="space-y-8">
              <SectionTitle
                title="Reading & Typing"
                description="Adjust how you read and interact with text."
              />

              <div className="liquid-glass-soft space-y-8 rounded-[32px] p-8">
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Default Layout</p>
                  <div className="inline-flex rounded-full border border-[var(--border)] bg-black/10 p-1.5 shadow-inner">
                    <TogglePill active={settings.readerMode === "scroll"} onClick={() => onChange({ ...settings, readerMode: "scroll" })}>
                      Single Page Scroll
                    </TogglePill>
                    <TogglePill active={settings.readerMode === "spread"} onClick={() => onChange({ ...settings, readerMode: "spread" })}>
                      2-Page Spread
                    </TogglePill>
                  </div>
                </div>

                <SelectField
                  label="Keyboard Layout"
                  value={settings.keyboardLayout}
                  options={[
                    { value: "qwerty-us", label: keyboardLayoutPresets["qwerty-us"].name },
                    { value: "colemak", label: keyboardLayoutPresets.colemak.name },
                    { value: "dvorak", label: keyboardLayoutPresets.dvorak.name },
                    { value: "custom", label: "Custom" },
                  ]}
                  onValueChange={(value) => onChange({ ...settings, keyboardLayout: value })}
                />

                {settings.keyboardLayout === "custom" && (
                  <label className="block space-y-3">
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Custom Keyboard Layout</span>
                    <p className="text-xs leading-5 text-[var(--text-muted)]">
                      Enter one row per line. The analytics view uses this to compute directional drift arrows.
                    </p>
                    <textarea
                      value={settings.customKeyboardLayout || ""}
                      onChange={(event) => onChange({ ...settings, customKeyboardLayout: event.target.value })}
                      rows={4}
                      placeholder={"1234567890-=\nqwertyuiop[]\\\nasdfghjkl;'\nzxcvbnm,./"}
                      className="w-full rounded-[24px] border border-[var(--border)] bg-black/10 px-5 py-4 outline-none transition focus:border-[var(--accent)] shadow-inner"
                    />
                  </label>
                )}

                <label className="block space-y-3">
                  <span className="text-xs font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Ignored Characters</span>
                  <p className="text-xs leading-5 text-[var(--text-muted)]">
                    Enter characters to auto-skip while typing. Use the format <code>"a", "b", "c"</code>. They remain visible in the text but do not count as correct or incorrect input.
                  </p>
                  <textarea
                    value={settings.ignoredCharacters || ""}
                    onChange={(event) => onChange({ ...settings, ignoredCharacters: event.target.value })}
                    rows={3}
                    placeholder={`"${'"'}", "'", "“", "”"`}
                    className="w-full rounded-[24px] border border-[var(--border)] bg-black/10 px-5 py-4 outline-none transition focus:border-[var(--accent)] shadow-inner"
                  />
                </label>
              </div>


            </div>
          )}

          {section === "storage" && (
            <div className="space-y-8">
              <SectionTitle
                title="Data & Storage"
                description="Manage your local data and backups."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <StorageCard
                  title="Export Database"
                  description="Back up the local SQLite database to a file you choose."
                  actionLabel="Export"
                  disabled={!desktopReady}
                  theme={settings.theme}
                  onAction={onExportDatabase}
                />
                <StorageCard
                  title="Import Database"
                  description="Replace the current local database with a previous backup."
                  actionLabel="Import"
                  disabled={!desktopReady}
                  theme={settings.theme}
                  onAction={onImportDatabase}
                />
              </div>

              <div className="liquid-glass-soft overflow-hidden rounded-[32px] border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] shadow-lg shadow-[var(--danger)]/5">
                <div className="bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--danger)]">Danger Zone</p>
                  <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">Irreversible actions that affect your local data and progress.</p>
                  <div className="mt-6 flex flex-wrap gap-4">
                    <Button variant="danger" onClick={onClearSessionHistory} disabled={!desktopReady} className="rounded-2xl px-6">
                      Clear Session History
                    </Button>
                    <Button variant="danger" onClick={onDeleteLibrary} disabled={!desktopReady} className="rounded-2xl px-6">
                      Delete Library
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await api.gainOneLevel();
                          await onRefresh();
                        } catch (err) {
                          console.error("Failed to gain level:", err);
                        }
                      }}
                      disabled={!desktopReady}
                      className="rounded-2xl px-6"
                    >
                      Gain 1 Level (Cheat)
                    </Button>
                  </div>
                </div>
              </div>

              {!desktopReady && (
                <p className="text-sm text-[var(--text-muted)]">
                  Storage actions require the desktop app because the browser preview has no access to your local database.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SidebarButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center rounded-[20px] px-4 py-3 text-left text-sm transition-all duration-300",
        active ? "bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/20" : "text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
      )}
    >
      <span className={cn("transition-transform duration-300", active ? "translate-x-1 font-bold" : "group-hover:translate-x-1")}>
        {children}
      </span>
    </button>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="relative pb-2">
      <h3 className="text-4xl font-black tracking-tighter text-[var(--text)]">{title}</h3>
      <p className="mt-3 max-w-2xl text-base font-medium leading-relaxed text-[var(--text-muted)]">{description}</p>
      <div className="absolute -bottom-2 left-0 h-1 w-12 rounded-full bg-[var(--accent)]/40" />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onValueChange: (value: T) => void;
}) {
  return (
    <label className="block space-y-3">
      <span className="text-xs font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onValueChange(event.target.value as T)}
          className="w-full rounded-[24px] border border-[var(--border)] bg-black/10 px-5 py-4 outline-none transition focus:border-[var(--accent)] shadow-inner appearance-none cursor-pointer pr-12"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[var(--bg)] text-[var(--text)]">
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </div>
    </label>
  );
}

function FontPreviewCard({
  label,
  value,
  active,
  sample,
  locked = false,
  lockLabel,
  onClick,
}: {
  label: string;
  value: AppFont;
  active: boolean;
  sample: string;
  locked?: boolean;
  lockLabel?: string;
  onClick: (font: AppFont) => void;
}) {
  const previewFont =
    value === "fira-code"
      ? '"Fira Code", ui-monospace, monospace'
      : value === "geist-mono"
        ? '"Geist Mono", ui-monospace, monospace'
        : '"JetBrains Mono", ui-monospace, monospace';

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onClick(value)}
      className={cn(
        "liquid-glass-soft relative rounded-[24px] border p-5 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-55",
        active 
          ? "border-[var(--accent)] scale-[1.03] !shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_30%,transparent)] z-10" 
          : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:scale-[1.01]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={cn(
          "text-sm font-bold transition-colors",
          active ? "text-[var(--accent)]" : ""
        )}>{label}</p>
        {locked && lockLabel && <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{lockLabel}</span>}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]" style={{ fontFamily: previewFont }}>
        {sample}
      </p>
    </button>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">{label}</span>
        <span className="text-sm text-[var(--text)]">{format(value)}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 h-2 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function TogglePill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300",
        active
          ? "bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/30 scale-105 z-10"
          : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled = false,
  theme,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  theme: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "liquid-glass-soft flex items-center justify-between gap-6 rounded-[30px] px-6 py-5",
        disabled && "opacity-55",
      )}
    >
      <div>
        <p className="text-base font-medium">{label}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 rounded-full transition disabled:cursor-not-allowed",
          checked ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,var(--text-muted)_40%,transparent)]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-white transition",
            checked ? "left-7" : "left-1",
          )}
        />
      </button>
    </div>
  );
}

function StorageCard({
  title,
  description,
  actionLabel,
  disabled,
  theme,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  theme: string;
  onAction: () => void;
}) {
  return (
    <div className="liquid-glass-soft rounded-[32px] p-6">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{description}</p>
      <Button className="mt-5" variant="secondary" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
