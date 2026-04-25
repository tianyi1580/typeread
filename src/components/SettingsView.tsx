import { type ReactNode, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { themeMap } from "../theme";
import { cn, clamp } from "../lib/utils";
import type { AppSettings, AppFont, ReaderMode, ThemeName } from "../types";

type SettingsSection = "appearance" | "reading" | "storage";

interface SettingsViewProps {
  isOpen: boolean;
  settings: AppSettings;
  desktopReady: boolean;
  onClose: () => void;
  onChange: (settings: AppSettings) => void;
  onExportDatabase: () => void;
  onImportDatabase: () => void;
  onClearSessionHistory: () => void;
  onDeleteLibrary: () => void;
}

export function SettingsView({
  isOpen,
  settings,
  desktopReady,
  onClose,
  onChange,
  onExportDatabase,
  onImportDatabase,
  onClearSessionHistory,
  onDeleteLibrary,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");
  const themeEntries = useMemo(() => Object.entries(themeMap) as Array<[ThemeName, (typeof themeMap)[ThemeName]]>, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <button type="button" aria-label="Close settings" className="absolute inset-0" onClick={onClose} />
      <Card className="relative grid h-[min(860px,88vh)] w-full max-w-[1180px] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_80%,transparent)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Settings</p>
              <h2 className="mt-3 text-2xl font-semibold">Application</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--text)]">
              Close
            </button>
          </div>

          <nav className="mt-8 space-y-2">
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
                {themeEntries.map(([key, theme]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange({ ...settings, theme: key })}
                    className={cn(
                      "rounded-[28px] border p-5 text-left transition hover:border-[var(--accent)]",
                      settings.theme === key ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel-soft)]",
                    )}
                  >
                    <div className="grid grid-cols-4 gap-2">
                      <span className="h-12 rounded-2xl" style={{ background: theme.background }} />
                      <span className="h-12 rounded-2xl" style={{ background: theme.panel }} />
                      <span className="h-12 rounded-2xl" style={{ background: theme.accent }} />
                      <span className="h-12 rounded-2xl" style={{ background: theme.text }} />
                    </div>
                    <p className="mt-4 text-lg font-semibold">{theme.name}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-6">
                <SelectField<AppFont>
                  label="Application Font"
                  value={settings.font}
                  options={[
                    { value: "jetbrains-mono", label: "JetBrains Mono" },
                    { value: "fira-code", label: "Fira Code" },
                    { value: "geist-mono", label: "Geist Mono" },
                  ]}
                  onValueChange={(font) => onChange({ ...settings, font })}
                />
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
                label="Enable Enter-to-Skip"
                description="Skipped words are still excluded from analytics. Turning this off makes Enter inert."
                checked={settings.enterToSkip}
                onChange={(checked) => onChange({ ...settings, enterToSkip: checked })}
              />

              <ToggleRow
                label="Ignore Quotation Marks"
                description="Quotation marks remain visible in the text, but the typing engine auto-skips them."
                checked={settings.ignoreQuotationMarks}
                onChange={(checked) => onChange({ ...settings, ignoreQuotationMarks: checked })}
              />
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
      <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">Panel</p>
      <h3 className="mt-3 text-3xl font-semibold">{title}</h3>
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
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-[26px] border border-[var(--border)] bg-[var(--panel-soft)] px-5 py-4">
      <div>
        <p className="text-base font-medium">{label}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 rounded-full transition",
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
