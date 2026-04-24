import type { AppSettings, InteractionMode, ReadFont, ReaderMode, ThemeName, TypeFont } from "../types";
import { Card } from "./ui/card";

interface SettingsViewProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

export function SettingsView({ settings, onChange }: SettingsViewProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="space-y-6 p-6">
        <SectionTitle title="Theme and Typography" description="Choose a visual system that matches the way you read and type." />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField<ThemeName>
            label="Theme"
            value={settings.theme}
            options={[
              { value: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
              { value: "gruvbox-dark", label: "Gruvbox Dark" },
              { value: "sepia", label: "Sepia" },
              { value: "solarized-light", label: "Solarized Light" },
            ]}
            onValueChange={(theme) => onChange({ ...settings, theme })}
          />
          <SelectField<TypeFont>
            label="Type Mode Font"
            value={settings.typeFont}
            options={[
              { value: "jetbrains-mono", label: "JetBrains Mono" },
              { value: "fira-code", label: "Fira Code" },
              { value: "geist-mono", label: "Geist Mono" },
            ]}
            onValueChange={(typeFont) => onChange({ ...settings, typeFont })}
          />
          <SelectField<ReadFont>
            label="Read Mode Font"
            value={settings.readFont}
            options={[
              { value: "inter", label: "Inter" },
              { value: "literata", label: "Literata" },
              { value: "merriweather", label: "Merriweather" },
            ]}
            onValueChange={(readFont) => onChange({ ...settings, readFont })}
          />
          <SelectField<ReaderMode>
            label="Default Reader Mode"
            value={settings.readerMode}
            options={[
              { value: "scroll", label: "Infinite Scroll" },
              { value: "spread", label: "2-Page Spread" },
            ]}
            onValueChange={(readerMode) => onChange({ ...settings, readerMode })}
          />
          <SelectField<InteractionMode>
            label="Default Interaction"
            value={settings.interactionMode}
            options={[
              { value: "type", label: "Type Mode" },
              { value: "read", label: "Read Mode" },
            ]}
            onValueChange={(interactionMode) => onChange({ ...settings, interactionMode })}
          />
        </div>
      </Card>

      <Card className="space-y-6 p-6">
        <SectionTitle title="Focus Mode" description="Keep the HUD stripped down while you are actively typing." />
        <label className="flex items-center justify-between rounded-3xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-4">
          <div>
            <p className="font-medium text-[var(--text)]">Minimal active HUD</p>
            <p className="text-sm text-[var(--text-muted)]">Only WPM, session time, and progress stay visible during active typing.</p>
          </div>
          <input
            type="checkbox"
            checked={settings.focusMode}
            onChange={(event) => onChange({ ...settings, focusMode: event.target.checked })}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>
      </Card>
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
      <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onValueChange(event.target.value as T)}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
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

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
