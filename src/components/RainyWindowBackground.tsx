import React, { useState, useEffect, useRef, memo } from "react";
import { cn } from "../lib/utils";

// ─── Configuration Constants ────────────────────────────────────────────────
// Tweak these to adjust the overall feel without touching render logic.

/** Base drop counts per layer at density=1. */
const BASE_BG_COUNT = 100;
const BASE_MID_COUNT = 50;
const BASE_FG_COUNT = 15;

/** Base splat count at density=1 and max visible at once. */
const BASE_SPLAT_INITIAL = 10;
const BASE_SPLAT_MAX = 60;
const SPLAT_TICK_INTERVAL_MS = 250;

/** Visual tuning per layer: [width, height, opacity, glowRadius, color]. */
const LAYER_CONFIG = {
  bg: { w: 1, h: 60, baseOpacity: 0.6, glow: 0, color: "102,153,155" },
  mid: { w: 1.5, h: 100, baseOpacity: 0.6, glow: 0, color: "102,153,155" },
  fg: { w: 2.5, h: 160, baseOpacity: 0.5, glow: 10, color: "102,153,155" },
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

interface RainDrop {
  x: number;        // Random x position in CSS pixels (0..canvasWidth)
  y: number;        // Current y position
  speed: number;    // px per second
  length: number;   // Drop height in px
  width: number;    // Drop width in px
  opacity: number;  // Per-drop opacity multiplier
  glowRadius: number;
  layerIdx: number; // 0=bg, 1=mid, 2=fg — for sprite lookup
}

interface Splat {
  x: number;        // CSS px
  y: number;        // CSS px
  radius: number;   // CSS px
  birth: number;    // timestamp (ms)
  lifetime: number; // total ms
}

// ─── Sprite Generation ──────────────────────────────────────────────────────

function createDropSprites(dpr: number): HTMLCanvasElement[] {
  const layers = [LAYER_CONFIG.bg, LAYER_CONFIG.mid, LAYER_CONFIG.fg];
  return layers.map(cfg => {
    // Width needs to accommodate the stem plus the glow diffusion on both sides
    const glowExpansion = cfg.glow * 2 * dpr;
    const w = Math.ceil(cfg.w * dpr + glowExpansion);
    const h = Math.ceil(cfg.h * dpr);

    const sprite = document.createElement("canvas");
    sprite.width = w;
    sprite.height = h;
    const sCtx = sprite.getContext("2d");
    if (!sCtx) return sprite;

    const centerX = w / 2;
    const stemW = cfg.w * dpr;

    // Use shadowBlur to create a natural diffusing glow around the drop stem
    if (cfg.glow > 0) {
      sCtx.shadowBlur = cfg.glow * dpr;
      sCtx.shadowColor = `rgba(${cfg.color}, 0.3)`;
    }

    const grad = sCtx.createLinearGradient(centerX, 0, centerX, h);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(1, `rgba(${cfg.color}, 0.45)`);
    sCtx.fillStyle = grad;

    // Draw the stem - shadow will be applied automatically
    sCtx.fillRect(centerX - stemW / 2, 0, stemW, h);

    return sprite;
  });
}

function createSplatSprite(dpr: number, maxRadius: number): HTMLCanvasElement {
  const size = Math.ceil(maxRadius * 2 * dpr) + 4;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const sCtx = sprite.getContext("2d");
  if (!sCtx) return sprite;

  const center = size / 2;
  const r = (maxRadius * dpr);
  const grad = sCtx.createRadialGradient(
    center * 0.7, center * 0.7, 0,
    center, center, r
  );
  grad.addColorStop(0, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(102,153,155,0.1)");
  sCtx.fillStyle = grad;
  sCtx.beginPath();
  sCtx.arc(center, center, r, 0, Math.PI * 2);
  sCtx.fill();

  // Subtle shadow ring
  sCtx.strokeStyle = "rgba(102,153,155,0.2)";
  sCtx.lineWidth = 1;
  sCtx.beginPath();
  sCtx.arc(center, center, r * 0.95, 0, Math.PI * 2);
  sCtx.stroke();

  return sprite;
}

// ─── Drop Initialization ────────────────────────────────────────────────────

function spawnDrop(
  width: number,
  height: number,
  layerIdx: number,
  speed: number,
  scatter: boolean
): RainDrop {
  const cfg = layerIdx === 0 ? LAYER_CONFIG.bg : layerIdx === 1 ? LAYER_CONFIG.mid : LAYER_CONFIG.fg;
  const baseSpeed = layerIdx === 0
    ? (height + cfg.h) / (1.2 + Math.random() * 0.8)  // bg: 1.2–2.0s
    : layerIdx === 1
      ? (height + cfg.h) / (0.7 + Math.random() * 0.5)  // mid: 0.7–1.2s
      : (height + cfg.h) / (0.4 + Math.random() * 0.3); // fg: 0.4–0.7s

  return {
    x: Math.random() * width,
    y: scatter ? -(Math.random() * (height + cfg.h)) : -cfg.h,
    speed: baseSpeed * speed,
    length: cfg.h,
    width: cfg.w,
    opacity: cfg.baseOpacity,
    glowRadius: cfg.glow,
    layerIdx,
  };
}

function initDrops(
  width: number,
  height: number,
  density: number,
  speed: number
): RainDrop[] {
  const bgCount = Math.floor(BASE_BG_COUNT * density);
  const midCount = Math.floor(BASE_MID_COUNT * density);
  const fgCount = Math.floor(BASE_FG_COUNT * density);
  const drops: RainDrop[] = [];

  for (let i = 0; i < bgCount; i++) drops.push(spawnDrop(width, height, 0, speed, true));
  for (let i = 0; i < midCount; i++) drops.push(spawnDrop(width, height, 1, speed, true));
  for (let i = 0; i < fgCount; i++) drops.push(spawnDrop(width, height, 2, speed, true));

  return drops;
}

// ─── Splat Lifecycle ────────────────────────────────────────────────────────

function splatOpacity(age: number, lifetime: number): number {
  const t = age / lifetime;
  if (t < 0.015) return (t / 0.015) * 0.4;          // Quick scale-in
  if (t < 0.04) return 0.3 + (1 - (t - 0.015) / 0.025) * 0.1; // Settle
  if (t < 0.8) return 0.3;                          // Stable
  return 0.3 * (1 - (t - 0.8) / 0.2);                 // Fade out
}

function splatScale(age: number, lifetime: number): number {
  const t = age / lifetime;
  if (t < 0.015) return 0.5 + (t / 0.015) * 0.9;     // 0.5 → 1.4
  if (t < 0.04) return 1.4 - ((t - 0.015) / 0.025) * 0.3; // 1.4 → 1.1
  if (t < 0.8) return 1.0 + (1 - (t - 0.04) / 0.76) * 0.1; // 1.1 → 1.0
  return 1.0 - ((t - 0.8) / 0.2) * 0.1;               // 1.0 → 0.9
}

// ─── RainParticles (Canvas) ─────────────────────────────────────────────────

/**
 * High-performance Canvas-based rain system.
 * Replaces hundreds of DOM nodes with a single rAF-driven canvas.
 *
 * All original props are preserved for full customizability.
 */
export const RainParticles = memo(function RainParticles({
  density = 1,
  splatDensity,
  splatSize = 1,
  opacity = 1,
  speed = 1,
  bgOpacity = 0.4,
  midOpacity = 0.6,
  fgOpacity = 1,
  showLightning = true,
  showSplats = true,
  className,
}: {
  density?: number;
  splatDensity?: number;
  splatSize?: number;
  opacity?: number;
  speed?: number;
  bgOpacity?: number;
  midOpacity?: number;
  fgOpacity?: number;
  showLightning?: boolean;
  showSplats?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeSplatDensity = splatDensity ?? density;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let drops: RainDrop[] = [];
    let splats: Splat[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let splatSprite: HTMLCanvasElement;
    let lastTime = 0;
    let lastSplatTick = 0;

    const layerOpacities = [bgOpacity, midOpacity, fgOpacity];

    // ── Resize handler ──────────────────────────────────────────────────
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      w = canvas.parentElement?.clientWidth ?? window.innerWidth;
      h = canvas.parentElement?.clientHeight ?? window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      sprites = createDropSprites(dpr);
      splatSprite = createSplatSprite(dpr, 6 * splatSize);
      drops = initDrops(w, h, density, speed);

      // Re-seed splats
      const now = performance.now();
      splats = [];
      if (showSplats) {
        const initialCount = Math.floor(BASE_SPLAT_INITIAL * activeSplatDensity);
        for (let i = 0; i < initialCount; i++) {
          splats.push({
            x: Math.random() * w,
            y: Math.random() * h,
            radius: (1 + Math.random() * 4) * splatSize,
            birth: now - Math.random() * 6000, // Stagger initial ages
            lifetime: 8000,
          });
        }
      }
    };

    window.addEventListener("resize", resize);
    resize();

    // ── Main render loop ────────────────────────────────────────────────
    const render = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.1); // Cap to avoid huge jumps
      lastTime = time;

      ctx.clearRect(0, 0, w, h);

      // ── Update & draw rain drops ──────────────────────────────────────
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.y += d.speed * dt;

        // If the drop has fallen past the viewport, respawn it
        if (d.y > h + 20) {
          const newDrop = spawnDrop(w, h, d.layerIdx, speed, false);
          drops[i] = newDrop;
          continue;
        }

        // Fade-in / fade-out based on position
        const topEdge = -d.length;
        const fadeInEnd = topEdge + d.length * 0.1;
        const fadeOutStart = h - d.length * 0.1;

        let dropAlpha = d.opacity;
        if (d.y < fadeInEnd) {
          dropAlpha *= Math.max(0, (d.y - topEdge) / (fadeInEnd - topEdge));
        } else if (d.y > fadeOutStart) {
          dropAlpha *= Math.max(0, 1 - (d.y - fadeOutStart) / (h - fadeOutStart + 20));
        }

        const layerAlpha = layerOpacities[d.layerIdx] ?? 1;
        const finalAlpha = dropAlpha * layerAlpha;

        if (finalAlpha <= 0.01) continue;

        const sprite = sprites[d.layerIdx];
        if (!sprite) continue;

        ctx.globalAlpha = finalAlpha;
        // Draw sprite at drop position
        const spriteW = sprite.width / dpr;
        const spriteH = sprite.height / dpr;
        ctx.drawImage(sprite, d.x - spriteW / 2, d.y, spriteW, spriteH);
      }

      // ── Update & draw splats ──────────────────────────────────────────
      if (showSplats && splatSprite) {
        // Periodic splat spawning
        if (time - lastSplatTick > SPLAT_TICK_INTERVAL_MS) {
          lastSplatTick = time;
          if (Math.random() < 0.6 * activeSplatDensity * speed) {
            const maxSplats = Math.floor(BASE_SPLAT_MAX * activeSplatDensity);
            if (splats.length < maxSplats) {
              splats.push({
                x: Math.random() * w,
                y: Math.random() * h,
                radius: (1 + Math.random() * 4) * splatSize,
                birth: time,
                lifetime: 8000,
              });
            }
            if (Math.random() < 0.4 * activeSplatDensity * speed && splats.length < maxSplats) {
              splats.push({
                x: Math.random() * w,
                y: Math.random() * h,
                radius: (1 + Math.random() * 4) * splatSize,
                birth: time,
                lifetime: 8000,
              });
            }
          }
        }

        // Draw & prune
        let writeIdx = 0;
        for (let i = 0; i < splats.length; i++) {
          const s = splats[i];
          const age = time - s.birth;
          if (age >= s.lifetime) continue; // expired

          splats[writeIdx++] = s;

          const alpha = splatOpacity(age, s.lifetime);
          if (alpha <= 0.01) continue;

          const scale = splatScale(age, s.lifetime);
          const drawR = s.radius * scale;
          const spriteW = splatSprite.width / dpr;
          const spriteH = splatSprite.height / dpr;
          const drawSize = drawR * 2;
          const ratio = drawSize / (spriteW);

          ctx.globalAlpha = alpha;
          ctx.drawImage(
            splatSprite,
            s.x - (spriteW * ratio) / 2,
            s.y - (spriteH * ratio) / 2,
            spriteW * ratio,
            spriteH * ratio
          );
        }
        splats.length = writeIdx;
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, [density, speed, bgOpacity, midOpacity, fgOpacity, activeSplatDensity, splatSize, showSplats]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)} style={{ opacity }}>
      {showLightning && <LightningTrigger />}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  );
});

// ─── Lightning (DOM — minimal, single element) ──────────────────────────────

/**
 * Isolated lightning component.
 * Kept as DOM since it's a single overlay element with CSS animation.
 */
const LightningTrigger = memo(function LightningTrigger() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const trigger = () => {
      setActive(true);
      setTimeout(() => setActive(false), 700);
      timeout = setTimeout(trigger, 15000 + Math.random() * 25000);
    };
    timeout = setTimeout(trigger, 8000);
    return () => clearTimeout(timeout);
  }, []);
  return <div className={cn("lightning-overlay", active && "flash-active")} />;
});

// ─── RainyWindowBackground (Main) ───────────────────────────────────────────

/**
 * RainyWindowBackground - Main background component.
 * Renders behind the entire app shell when the rainy-window theme is active.
 */
export const RainyWindowBackground = memo(function RainyWindowBackground({
  density = 1,
  speed = 1,
  splatDensity = 0.4,
  splatSize = 1.5,
}: {
  density?: number;
  speed?: number;
  splatDensity?: number;
  splatSize?: number;
}) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#1e293b] transform-gpu">
      <RainParticles
        density={density}
        speed={speed}
        showLightning={true}
        showSplats={true}
        splatSize={splatSize}
        splatDensity={splatDensity}
      />

      {/* Background Ambience Blobs - No blurring/filters for performance */}
      <div className="absolute top-[20%] left-[15%] w-[60vw] h-[60vw] bg-[#66999B]/05 rounded-full pointer-events-none" />
      <div className="absolute bottom-[25%] right-[5%] w-[50vw] h-[50vw] bg-slate-700/05 rounded-full pointer-events-none" />

      {/* Final Vignette & Grounding Ledge */}
      <div className="absolute inset-0 z-40 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(15,23,42,0.4)_100%)] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#3d2b1f] z-50 opacity-40 pointer-events-none" />
    </div>
  );
});
