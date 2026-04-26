import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  levelLabel?: string;
  label?: string;
}

const PRESET_COLORS = [
  "#ED8796", // Catppuccin Red
  "#FB4934", // Gruvbox Red
  "#AA3D2B", // Sepia Red
  "#DC322F", // Solarized Red
  "#FF5555", // Dracula Red
  "#BF616A", // Nord Red
  "#F0ABFC", // Pink
  "#FCA5A5", // Light Red
  "#FDBA74", // Orange
  "#FDE047", // Yellow
];

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  levelLabel,
  label = "Color",
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInteracting = useRef(false);
  
  // Use local state for HSV to avoid jitter and wrap-around jumps during dragging
  const [localHsv, setLocalHsv] = useState(() => hexToHsv(value));
  const [localHex, setLocalHex] = useState(value);

  // Sync with external value when not interacting
  useEffect(() => {
    if (isInteracting.current) return;

    const incomingHsv = hexToHsv(value);
    const currentHex = hsvToHex(localHsv.h, localHsv.s, localHsv.v);

    if (value.toUpperCase() !== currentHex) {
      // Preserve local hue for grayscale/black to prevent jumping
      // Use a small epsilon to handle precision loss
      if (incomingHsv.s < 0.1 || incomingHsv.v < 0.1) {
        incomingHsv.h = localHsv.h;
      }
      
      setLocalHsv(incomingHsv);
      setLocalHex(value);
    }
  }, [value, localHsv.h]);

  const updateHsv = useCallback((newHsv: Partial<{ h: number; s: number; v: number }>) => {
    isInteracting.current = true;
    
    setLocalHsv(prev => {
      const updated = { ...prev, ...newHsv };
      updated.h = Math.max(1, Math.min(360, updated.h));
      updated.s = Math.max(0, Math.min(100, updated.s));
      updated.v = Math.max(0, Math.min(100, updated.v));
      
      const newHex = hsvToHex(updated.h, updated.s, updated.v);
      setLocalHex(newHex);
      
      // Notify parent of the change
      onChange(newHex);
      
      return updated;
    });

    // Reset the interaction flag after a short delay to allow parent state to propagate back
    setTimeout(() => {
      isInteracting.current = false;
    }, 100);
  }, [onChange]);

  const handleHexChange = (newHex: string) => {
    setLocalHex(newHex);
    if (/^#[0-9A-F]{6}$/i.test(newHex) || /^#[0-9A-F]{3}$/i.test(newHex)) {
      const hsv = hexToHsv(newHex);
      setLocalHsv(hsv);
      onChange(newHex.toUpperCase());
    }
  };

  const handleEyeDropper = async () => {
    // @ts-ignore - EyeDropper is a new API
    if (!window.EyeDropper) return;
    try {
      // @ts-ignore
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex.toUpperCase());
    } catch (e) {
      console.error("EyeDropper failed:", e);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const stopProp = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-muted)]">
          {label}
        </span>
        {disabled && levelLabel && (
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {levelLabel}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "group relative h-12 w-12 flex-shrink-0 rounded-[18px] border border-[var(--border)] p-1 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
            isOpen && "ring-2 ring-[var(--accent)]"
          )}
        >
          <div 
            className="h-full w-full rounded-[12px] shadow-inner" 
            style={{ backgroundColor: value }} 
          />
          <div className="absolute inset-0 rounded-[18px] opacity-0 transition-opacity group-hover:opacity-100 bg-white/10" />
        </button>
        <div className="relative flex-1">
          <input
            type="text"
            value={localHex}
            disabled={disabled}
            onKeyDown={stopProp}
            onChange={(e) => handleHexChange(e.target.value)}
            className="h-12 w-full rounded-[18px] border border-[var(--border)] bg-[var(--panel-soft)] pl-4 pr-12 py-3 font-mono text-sm uppercase outline-none transition focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
            placeholder="#FFFFFF"
          />
          {/* @ts-ignore */}
          {window.EyeDropper && !disabled && (
            <button
              type="button"
              onClick={handleEyeDropper}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] transition"
              title="Eye Dropper"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z"/></svg>
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute left-0 bottom-[calc(100%+12px)] z-[60] w-[300px] origin-bottom-left overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="space-y-5">
              <SaturationValuePicker
                h={localHsv.h}
                s={localHsv.s}
                v={localHsv.v}
                onChange={(s, v) => updateHsv({ s, v })}
              />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Hue</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{Math.round(localHsv.h)}°</span>
                </div>
                <HueSlider h={localHsv.h} onChange={(h) => updateHsv({ h })} />
              </div>

              <div className="space-y-3">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Presets</span>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onChange(color)}
                      className={cn(
                        "h-8 w-full rounded-lg border border-white/10 transition hover:scale-110 active:scale-90",
                        value === color && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel)]"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Hex</span>
                  <input
                    type="text"
                    value={localHex}
                    onKeyDown={stopProp}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2 font-mono text-xs uppercase outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Preview</span>
                  <div className="flex h-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-1 overflow-hidden">
                    <div className="h-full w-full rounded-lg shadow-sm" style={{ backgroundColor: value }} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SaturationValuePicker({
  h,
  s,
  v,
  onChange,
}: {
  h: number;
  s: number;
  v: number;
  onChange: (s: number, v: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onChange(x * 100, y * 100);
  }, [onChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft": onChange(Math.max(0, s - step), v); break;
      case "ArrowRight": onChange(Math.min(100, s + step), v); break;
      case "ArrowUp": onChange(s, Math.min(100, v + step)); break;
      case "ArrowDown": onChange(s, Math.max(0, v - step)); break;
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && handlePointerMove(e)}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="relative aspect-video w-full cursor-crosshair rounded-[20px] overflow-hidden outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--panel)] shadow-inner select-none"
      style={{
        backgroundColor: `hsl(${h}, 100%, 50%)`,
        backgroundImage: `
          linear-gradient(to right, #fff, transparent),
          linear-gradient(to top, #000, transparent)
        `,
      }}
    >
      <motion.div
        className="absolute h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-white shadow-lg pointer-events-none"
        animate={{
          left: `${s}%`,
          bottom: `${v}%`,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 350, mass: 0.5 }}
      >
        <div className="h-full w-full rounded-full border border-black/10" />
      </motion.div>
    </div>
  );
}

function HueSlider({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // Map 0-1 to 1-360
    onChange(1 + x * 359);
  }, [onChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    switch (e.key) {
      case "ArrowLeft": case "ArrowDown": onChange(Math.max(1, h - step)); break;
      case "ArrowRight": case "ArrowUp": onChange(Math.min(360, h + step)); break;
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && handlePointerMove(e)}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="relative h-6 w-full cursor-pointer rounded-full outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--panel)] shadow-inner select-none"
      style={{
        background: `linear-gradient(to right, 
          #ff0000 0%, #ffff00 17%, #00ff00 33%, 
          #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)`,
      }}
    >
      <motion.div
        className="absolute top-1/2 h-8 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-white shadow-xl pointer-events-none"
        animate={{ left: `${((h - 1) / 359) * 100}%` }}
        transition={{ type: "spring", damping: 25, stiffness: 350, mass: 0.5 }}
      >
        <div className="mx-auto mt-[6px] h-3 w-[2px] rounded-full bg-black/10" />
      </motion.div>
    </div>
  );
}

// Helper functions
function hexToHsv(hex: string) {
  let r = 0, g = 0, b = 0;
  const cleanHex = hex.replace("#", "");
  
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    return { h: 0, s: 100, v: 100 };
  }

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s;
  const v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

function hsvToHex(h: number, s: number, v: number) {
  h /= 360; s /= 100; v /= 100;
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (x: number) => {
    const val = Math.round(x * 255);
    return val.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

