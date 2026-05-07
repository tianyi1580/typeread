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

// ─── Drop Initialization ────────────────────────────────────────────────────

/**
 * Resets a drop to its starting state (top of screen, random X, new speed).
 * Mutates the object in place to avoid GC pressure in the animation loop.
 */
function resetDrop(
  drop: RainDrop,
  width: number,
  height: number,
  layerIdx: number,
  speed: number,
  scatter: boolean
): void {
  const cfg = layerIdx === 0 ? LAYER_CONFIG.bg : layerIdx === 1 ? LAYER_CONFIG.mid : LAYER_CONFIG.fg;
  
  // Speed logic preserved: 
  // bg: 1.2–2.0s to cross (height + dropHeight)
  // mid: 0.7–1.2s
  // fg: 0.4–0.7s
  const durationBase = layerIdx === 0 
    ? (1.2 + Math.random() * 0.8) 
    : layerIdx === 1 
      ? (0.7 + Math.random() * 0.5) 
      : (0.4 + Math.random() * 0.3);

  drop.x = Math.random() * width;
  drop.y = scatter ? -(Math.random() * (height + cfg.h)) : -cfg.h;
  drop.speed = ((height + cfg.h) / durationBase) * speed;
  drop.length = cfg.h;
  drop.width = cfg.w;
  drop.opacity = cfg.baseOpacity;
  drop.layerIdx = layerIdx;
}

function spawnDrop(
  width: number,
  height: number,
  layerIdx: number,
  speed: number,
  scatter: boolean
): RainDrop {
  const drop = {} as RainDrop;
  resetDrop(drop, width, height, layerIdx, speed, scatter);
  return drop;
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
 * Optimized for zero-allocation animation loops and smooth state transitions.
 *
 * All original props and aesthetic qualities are strictly maintained.
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
  showAtmospherics = false,
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
  showAtmospherics?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Persistent refs to avoid re-allocation and visual resets
  const dropsRef = useRef<RainDrop[]>([]);
  const splatsRef = useRef<Splat[]>([]);
  const lastStateRef = useRef({ density, speed });
  const metricsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const spritesRef = useRef<{ drops: HTMLCanvasElement[]; splat: HTMLCanvasElement | null; noise: HTMLCanvasElement | null }>({
    drops: [],
    splat: null,
    noise: null,
  });

  // Track metrics to avoid divisions in the render loop
  const spriteMetricsRef = useRef<{ sw: number; sh: number }[]>([]);
  const splatMetricRef = useRef({ sw: 0, sh: 0 });

  // Track the actual splat density used
  const activeSplatDensity = splatDensity ?? density;

  // Refs for smooth prop updates without loop restarts
  const propsRef = useRef({
    speed,
    bgOpacity,
    midOpacity,
    fgOpacity,
    opacity,
    activeSplatDensity,
    splatSize
  });

  useEffect(() => {
    propsRef.current = {
      speed,
      bgOpacity,
      midOpacity,
      fgOpacity,
      opacity,
      activeSplatDensity,
      splatSize
    };
  }, [speed, bgOpacity, midOpacity, fgOpacity, opacity, activeSplatDensity, splatSize]);

  // Initialize drops only once or when density/speed changes
  const syncDrops = (width: number, height: number, targetDensity: number, currentSpeed: number) => {
    const bgTarget = Math.floor(BASE_BG_COUNT * targetDensity);
    const midTarget = Math.floor(BASE_MID_COUNT * targetDensity);
    const fgTarget = Math.floor(BASE_FG_COUNT * targetDensity);
    
    const counts = [bgTarget, midTarget, fgTarget];
    let currentDrops = dropsRef.current;

    // Adjust each layer
    for (let layerIdx = 0; layerIdx < 3; layerIdx++) {
      const layerDrops = currentDrops.filter(d => d.layerIdx === layerIdx);
      const target = counts[layerIdx];
      
      // Update speeds of existing drops in this layer if speed changed
      if (lastStateRef.current.speed !== currentSpeed) {
        const ratio = currentSpeed / (lastStateRef.current.speed || 1);
        layerDrops.forEach(d => {
          d.speed *= ratio;
        });
      }

      if (layerDrops.length < target) {
        // Add more drops
        const toAdd = target - layerDrops.length;
        for (let i = 0; i < toAdd; i++) {
          currentDrops.push(spawnDrop(width, height, layerIdx, currentSpeed, true));
        }
      } else if (layerDrops.length > target) {
        // Remove excess drops from this layer
        let removed = 0;
        const toRemove = layerDrops.length - target;
        dropsRef.current = currentDrops.filter(d => {
          if (d.layerIdx === layerIdx && removed < toRemove) {
            removed++;
            return false;
          }
          return true;
        });
        currentDrops = dropsRef.current;
      }
    }
    
    lastStateRef.current.speed = currentSpeed;
    lastStateRef.current.density = targetDensity;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;
    let lastSplatTick = 0;
    let staticDrawn = false;

    const updateMetrics = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? window.innerWidth;
      const h = parent?.clientHeight ?? window.innerHeight;
      
      if (w !== metricsRef.current.w || h !== metricsRef.current.h || dpr !== metricsRef.current.dpr) {
        staticDrawn = false;
        metricsRef.current = { w, h, dpr };
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Re-generate sprites
        const dSprites = createDropSprites(dpr);
        spritesRef.current.drops = dSprites;
        spritesRef.current.splat = createSplatSprite(dpr, 6 * splatSize);
        
        // Cache metrics
        spriteMetricsRef.current = dSprites.map(s => ({
          sw: s.width / dpr,
          sh: s.height / dpr
        }));
        if (spritesRef.current.splat) {
          splatMetricRef.current = {
            sw: spritesRef.current.splat.width / dpr,
            sh: spritesRef.current.splat.height / dpr
          };
        }

        // Generate noise sprite for dithering
        const noiseCanvas = document.createElement("canvas");
        noiseCanvas.width = 128;
        noiseCanvas.height = 128;
        const nCtx = noiseCanvas.getContext("2d");
        if (nCtx) {
          const idata = nCtx.createImageData(128, 128);
          const data = idata.data;
          for (let i = 0; i < data.length; i += 4) {
            const val = Math.random() * 255;
            data[i] = data[i+1] = data[i+2] = val;
            data[i+3] = 20; // Subtle
          }
          nCtx.putImageData(idata, 0, 0);
          spritesRef.current.noise = noiseCanvas;
        }

        // Sync drops to new dimensions
        syncDrops(w, h, density, speed);
      }
    };

    const resize = () => updateMetrics();
    window.addEventListener("resize", resize);
    updateMetrics();

    // Initial splat seeding if empty
    if (showSplats && splatsRef.current.length === 0) {
      const initialCount = Math.floor(BASE_SPLAT_INITIAL * activeSplatDensity);
      const now = performance.now();
      for (let i = 0; i < initialCount; i++) {
        splatsRef.current.push({
          x: Math.random() * metricsRef.current.w,
          y: Math.random() * metricsRef.current.h,
          radius: (1 + Math.random() * 4) * splatSize,
          birth: now - Math.random() * 6000,
          lifetime: 8000,
        });
      }
    }

    const render = (time: number) => {
      if (lastTime === 0) {
        lastTime = time;
        animId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const { w, h } = metricsRef.current;
      const { drops, splat: splatSprite, noise: noiseSprite } = spritesRef.current;
      const splats = splatsRef.current;
      const spriteMetrics = spriteMetricsRef.current;
      const dropsList = dropsRef.current;
      
      if (dropsList.length === 0 && splats.length === 0) {
        if (staticDrawn) {
          animId = requestAnimationFrame(render);
          return;
        }
        staticDrawn = true;
      } else {
        staticDrawn = false;
      }
      
      ctx.clearRect(0, 0, w, h);

      // ── Draw Atmospherics ──────────────────────────────────────────
      // Canvas radial gradients are drawn with higher bit-depth than CSS, 
      // resolving banding issues in semi-transparent gradients.
      if (showAtmospherics) {
        // Ambient Blobs (using Canvas for better falloff)
        const blob1 = ctx.createRadialGradient(w * 0.2, h * 0.3, 0, w * 0.2, h * 0.3, w * 0.6);
        blob1.addColorStop(0, 'rgba(102,153,155,0.06)');
        blob1.addColorStop(1, 'rgba(102,153,155,0)');
        ctx.fillStyle = blob1;
        ctx.fillRect(0, 0, w, h);

        const blob2 = ctx.createRadialGradient(w * 0.8, h * 0.7, 0, w * 0.8, h * 0.7, w * 0.5);
        blob2.addColorStop(0, 'rgba(71,85,105,0.08)');
        blob2.addColorStop(1, 'rgba(71,85,105,0)');
        ctx.fillStyle = blob2;
        ctx.fillRect(0, 0, w, h);

        // Vignette (Manual easing for professional transition)
        const vignette = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.8);
        vignette.addColorStop(0, 'rgba(15,23,42,0)');
        vignette.addColorStop(0.3, 'rgba(15,23,42,0.05)');
        vignette.addColorStop(0.6, 'rgba(15,23,42,0.25)');
        vignette.addColorStop(1, 'rgba(15,23,42,0.6)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        
        // Manual Dither Pass
        if (noiseSprite) {
          ctx.globalCompositeOperation = 'overlay';
          ctx.globalAlpha = 0.4;
          for (let nx = 0; nx < w; nx += 128) {
            for (let ny = 0; ny < h; ny += 128) {
              ctx.drawImage(noiseSprite, nx, ny);
            }
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // ── Update & Draw Rain Drops ──────────────────────────────────────
      const { 
        bgOpacity: bgO, 
        midOpacity: midO, 
        fgOpacity: fgO,
        speed: currentSpeed 
      } = propsRef.current;
      
      const layerOpacities = [bgO, midO, fgO];
      
      for (let i = 0; i < dropsList.length; i++) {
        const d = dropsList[i];
        d.y += d.speed * dt;

        if (d.y > h + 20) {
          resetDrop(d, w, h, d.layerIdx, currentSpeed, false);
        }

        const sprite = drops[d.layerIdx];
        if (!sprite || !spriteMetrics[d.layerIdx]) continue;

        const { sw, sh } = spriteMetrics[d.layerIdx];

        // Fade logic preserved for high quality visual immersion
        const topEdge = -d.length;
        const fadeInEnd = topEdge + d.length * 0.1;
        const fadeOutStart = h - d.length * 0.1;

        let dropAlpha = d.opacity;
        if (d.y < fadeInEnd) {
          dropAlpha *= Math.max(0, (d.y - topEdge) / (fadeInEnd - topEdge));
        } else if (d.y > fadeOutStart) {
          dropAlpha *= Math.max(0, 1 - (d.y - fadeOutStart) / (h - fadeOutStart + 20));
        }

        const finalAlpha = dropAlpha * (layerOpacities[d.layerIdx] ?? 1);
        if (finalAlpha > 0.005) {
          ctx.globalAlpha = finalAlpha;
          ctx.drawImage(sprite, d.x - sw / 2, d.y, sw, sh);
        }
      }

      // ── Update & Draw Splats ──────────────────────────────────────────
      if (showSplats && splatSprite) {
        if (time - lastSplatTick > SPLAT_TICK_INTERVAL_MS) {
          lastSplatTick = time;
          const { activeSplatDensity: aSD, speed: s } = propsRef.current;
          const spawnChance = 0.6 * aSD * s;
          if (Math.random() < spawnChance) {
            const maxSplats = Math.floor(BASE_SPLAT_MAX * aSD);
            for (let j = 0; j < 2; j++) {
              if (splats.length < maxSplats && (j === 0 || Math.random() < 0.4)) {
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
        }

        let writeIdx = 0;
        for (let i = 0; i < splats.length; i++) {
          const s = splats[i];
          const age = time - s.birth;
          if (age < s.lifetime) {
            splats[writeIdx++] = s;
            const alpha = splatOpacity(age, s.lifetime);
            if (alpha > 0.005) {
              const scale = splatScale(age, s.lifetime);
              const drawSize = s.radius * scale * 2;
              ctx.globalAlpha = alpha;
              ctx.drawImage(splatSprite, s.x - drawSize / 2, s.y - drawSize / 2, drawSize, drawSize);
            }
          }
        }
        if (splats.length !== writeIdx) splats.length = writeIdx;
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, [splatSize, showSplats, showAtmospherics]);

  // Sync density/speed changes without restarting the animation loop
  useEffect(() => {
    const { w, h } = metricsRef.current;
    if (w > 0 && h > 0) {
      syncDrops(w, h, density, speed);
    }
  }, [density, speed]);


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
        showAtmospherics={true}
        splatSize={splatSize}
        splatDensity={splatDensity}
      />
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#3d2b1f] z-50 opacity-40 pointer-events-none" />
    </div>
  );
});
