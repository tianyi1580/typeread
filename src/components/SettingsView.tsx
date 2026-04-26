import { type ReactNode, useMemo, useState } from "react";
import { keyboardLayoutPresets } from "../lib/keyboard-layouts";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { themeMap } from "../theme";
import { cn, clamp } from "../lib/utils";
import { api } from "../lib/tauri";
import type { AppSettings, AppFont, KeyboardLayoutId, ProfileProgress, ThemeName } from "../types";

type SettingsSection = "appearance" | "reading" | "storage";

interface SettingsViewProps {
  isOpen: boolean;
  settings: AppSettings;
  profile: ProfileProgress | null;
  desktopReady: boolean;
  onClose: () => void;
  onChange: (settings: AppSettings) => void;
  onExportDatabase: () => void;
  onImportDatabase: () => void;
  onClearSessionHistory: () => void;
  onDeleteLibrary: () => void;
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
  const unlocks = profile?.unlocks ?? {
    draculaTheme: false,
    nordTheme: false,
    smoothCaret: false,
    premiumTypography: false,
    ghostPacer: false,
    customErrorColors: false,
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <button type="button" aria-label="Close settings" className="absolute inset-0" onClick={onClose} />
      <Card className="relative grid h-[min(860px,88vh)] w-full max-w-[1180px] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_80%,transparent)] p-5">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={onClose}
              className="w-fit text-xs uppercase tracking-[0.28em] text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              Close
            </button>
            <h2 className="mt-5 text-center text-2xl font-semibold">Settings</h2>
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

        <div className="overflow-y-auto p-6 lg:p-8">
          {section === "appearance" && (
            <div className="space-y-8">
              <SectionTitle
                title="Appearance"
                description="Theme and typography should change in real time. If settings feel inert, the UI is lying."
              />

              <div className="grid gap-4 md:grid-cols-2">
                {themeEntries.map(([key, theme]) => {
                  const locked = (key === "dracula" && !unlocks.draculaTheme) || (key === "nord" && !unlocks.nordTheme);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={locked}
                      onClick={() => onChange({ ...settings, theme: key })}
                      className={cn(
                        "rounded-[28px] border p-5 text-left transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55",
                        settings.theme === key ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel-soft)]",
                      )}
                    >
                      <div className="grid grid-cols-4 gap-2">
                        <span className="h-12 rounded-2xl" style={{ background: theme.background }} />
                        <span className="h-12 rounded-2xl" style={{ background: theme.panel }} />
                        <span className="h-12 rounded-2xl" style={{ background: theme.accent }} />
                        <span className="h-12 rounded-2xl" style={{ background: theme.text }} />
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-lg font-semibold">{theme.name}</p>
                        {locked && <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Lvl 5</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-6">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Typing Font</p>
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
              </div>

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

              <ToggleRow
                label="Smooth Caret"
                description="Unlocked at level 10. Keeps the caret motion less harsh during dense typing runs."
                checked={settings.smoothCaret}
                disabled={!unlocks.smoothCaret}
                onChange={(checked) => onChange({ ...settings, smoothCaret: checked })}
              />

              <label className="space-y-3">
                <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Error Highlight Color</span>
                <input
                  type="text"
                  value={settings.errorColor}
                  disabled={!unlocks.customErrorColors}
                  onChange={(event) => onChange({ ...settings, errorColor: event.target.value })}
                  className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 outline-none transition focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
                />
                {!unlocks.customErrorColors && (
                  <p className="text-sm text-[var(--text-muted)]">Unlocks at level 50.</p>
                )}
              </label>
            </div>
          )}

          {section === "reading" && (
            <div className="space-y-8">
              <SectionTitle
                title="Reading & Typing"
                description="Launch defaults and typing behavior belong here, not scattered across random widgets."
              />

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Default Layout</p>
                <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel-soft)] p-1">
                  <TogglePill active={settings.readerMode === "scroll"} onClick={() => onChange({ ...settings, readerMode: "scroll" })}>
                    Single Page Scroll
                  </TogglePill>
                  <TogglePill active={settings.readerMode === "spread"} onClick={() => onChange({ ...settings, readerMode: "spread" })}>
                    2-Page Spread
                  </TogglePill>
                </div>
              </div>

              <ToggleRow
                label="Enable Tab-to-Skip"
                description="Skipped words are still excluded from analytics. Turning this off makes Tab inert."
                checked={settings.tabToSkip}
                onChange={(checked) => onChange({ ...settings, tabToSkip: checked })}
              />

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
                <label className="space-y-3">
                  <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Custom Keyboard Layout</span>
                  <p className="text-sm leading-7 text-[var(--text-muted)]">
                    Enter one row per line. The analytics view uses this to compute directional drift arrows.
                  </p>
                  <textarea
                    value={settings.customKeyboardLayout}
                    onChange={(event) => onChange({ ...settings, customKeyboardLayout: event.target.value })}
                    rows={4}
                    placeholder={"1234567890-=\nqwertyuiop[]\\\nasdfghjkl;'\nzxcvbnm,./"}
                    className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
              )}

              <label className="space-y-3">
                <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Ignored Characters</span>
                <p className="text-sm leading-7 text-[var(--text-muted)]">
                  Enter characters to auto-skip while typing. Use the format <code>"a", "b", "c"</code>. They remain visible in the text but do not count as correct or incorrect input.
                </p>
                <textarea
                  value={settings.ignoredCharacters}
                  onChange={(event) => onChange({ ...settings, ignoredCharacters: event.target.value })}
                  rows={3}
                  placeholder={`"${'"'}", "'", "“", "”"`}
                  className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>


            </div>
          )}

          {section === "storage" && (
            <div className="space-y-8">
              <SectionTitle
                title="Data & Storage"
                description="Everything is local. That means the user gets real control over backups and destructive maintenance."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <StorageCard
                  title="Export Database"
                  description="Back up the local SQLite database to a file you choose."
                  actionLabel="Export"
                  disabled={!desktopReady}
                  onAction={onExportDatabase}
                />
                <StorageCard
                  title="Import Database"
                  description="Replace the current local database with a previous backup."
                  actionLabel="Import"
                  disabled={!desktopReady}
                  onAction={onImportDatabase}
                />
              </div>

              <div className="rounded-[28px] border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--panel))] p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--danger)]">Danger Zone</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="danger" onClick={onClearSessionHistory} disabled={!desktopReady}>
                    Clear Session History
                  </Button>
                  <Button variant="danger" onClick={onDeleteLibrary} disabled={!desktopReady}>
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
                        alert("Failed to gain level. Check console.");
                      }
                    }} 
                    disabled={!desktopReady}
                  >
                    Gain 1 Level (Cheat)
                  </Button>
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
        "flex w-full items-center rounded-[20px] px-4 py-3 text-left text-sm transition",
        active ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-3xl font-semibold">{title}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">{description}</p>
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
    <label className="space-y-2">
      <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onValueChange(event.target.value as T)}
        className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
        "rounded-[24px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-[var(--accent)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        {locked && lockLabel && <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{lockLabel}</span>}
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]" style={{ fontFamily: previewFont }}>
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
      className={cn("rounded-full px-4 py-2 text-sm transition", active ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]")}
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
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 rounded-[26px] border border-[var(--border)] bg-[var(--panel-soft)] px-5 py-4",
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
        aria-pressed={checked}
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
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel-soft)] p-5">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{description}</p>
      <Button className="mt-5" variant="secondary" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
