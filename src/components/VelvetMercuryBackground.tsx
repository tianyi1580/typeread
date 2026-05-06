import React, { useRef, useEffect, memo } from "react";
import { cn } from "../lib/utils";

// ─── Configuration & Types ──────────────────────────────────────────────────

/** Maximum particles at full density. Reader uses isSubtle for reduced count. */
const MAX_PARTICLES = 800;
const SUBTLE_PARTICLES = 180;

/** Heart path sampling resolution — higher = smoother attractor surface. */
const HEART_SAMPLES = 400;

/** Simplex-style noise via fast sine harmonics (avoids external deps). */
function flowNoise(x: number, y: number, t: number, seed: number): number {
  return (
    Math.sin(x * 0.013 + t * 0.3 + seed) * 0.5 +
    Math.cos(y * 0.017 + t * 0.23 + seed * 1.3) * 0.5 +
    Math.sin((x + y) * 0.009 + t * 0.17 + seed * 0.7) * 0.3
  );
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Relative rendering size multiplier (0.3 – 1.6). */
  size: number;
  /** Unique noise seed for organic flow. */
  seed: number;
  /** Index into the heart attractor path. */
  targetIdx: number;
  /** Current base opacity (shimmer modulated per-frame). */
  baseOpacity: number;
  /** Sprite variant index (0–3). */
  spriteIdx: number;
  /** Phase offset for shimmer sinusoid. */
  shimmerPhase: number;
}

interface HeartPoint {
  x: number;
  y: number;
}

// ─── Heart Path ─────────────────────────────────────────────────────────────

function generateHeartPath(
  cx: number,
  cy: number,
  scale: number,
  count: number,
): HeartPoint[] {
  const points: HeartPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    // Classic parametric heart — symmetric, no sharp edges
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    points.push({ x: cx + hx * scale, y: cy + hy * scale });
  }
  return points;
}

/**
 * Also generate interior fill points so particles aren't only on the edge.
 * This creates the dense "cloud" effect inside the heart silhouette.
 */
function generateInteriorPoints(
  cx: number,
  cy: number,
  scale: number,
  count: number,
): HeartPoint[] {
  const points: HeartPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const r = Math.random() * 0.85; // 0 = center, 1 = edge
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    points.push({ x: cx + hx * scale * r, y: cy + hy * scale * r });
  }
  return points;
}

// ─── Sprite Generation ──────────────────────────────────────────────────────

/**
 * Pre-renders 4 ethereal particle sprites to off-screen canvases.
 * Each is a soft radial glow — no hard edges.
 * Variants: warm pink, hot red core, cool white, tiny sparkle.
 */
function createSprites(dpr: number): HTMLCanvasElement[] {
  const configs = [
    { radius: 5, color: [255, 180, 200] },  // Warm blush
    { radius: 4, color: [232, 55, 90] },     // Hot red core
    { radius: 6, color: [255, 245, 248] },   // Cool white
    { radius: 3, color: [255, 130, 170] },   // Tiny sparkle
  ];

  return configs.map(({ radius, color }) => {
    const pad = radius * 3;
    const size = (radius + pad) * 2;
    const c = document.createElement("canvas");
    c.width = Math.ceil(size * dpr);
    c.height = Math.ceil(size * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return c;

    ctx.scale(dpr, dpr);
    const center = size / 2;

    const g = ctx.createRadialGradient(center, center, 0, center, center, radius + pad * 0.6);
    g.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`);
    g.addColorStop(0.25, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.45)`);
    g.addColorStop(0.55, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.12)`);
    g.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(center, center, radius + pad * 0.6, 0, Math.PI * 2);
    ctx.fill();

    return c;
  });
}

// ─── Sprite draw-size cache ─────────────────────────────────────────────────

interface SpriteMetric {
  sw: number;
  sh: number;
}

// ─── VelvetMercuryParticles ─────────────────────────────────────────────────

export const VelvetMercuryParticles = memo(function VelvetMercuryParticles({
  density = 1,
  opacity = 1,
  isSubtle = false,
  className,
  wpm = 0,
}: {
  density?: number;
  opacity?: number;
  isSubtle?: boolean;
  className?: string;
  wpm?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const heartPathRef = useRef<HeartPoint[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const spriteMetricsRef = useRef<SpriteMetric[]>([]);
  const metricsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastTimeRef = useRef(0);

  // Smooth props access (avoids loop restarts)
  const propsRef = useRef({ density, opacity, isSubtle, wpm });
  useEffect(() => {
    propsRef.current = { density, opacity, isSubtle, wpm };
  }, [density, opacity, isSubtle, wpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      metricsRef.current = { w, h, dpr };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Heart scale: fills ~35% of the smaller dimension
      const heartScale = Math.min(w, h) * 0.018;
      const cx = w / 2;
      const cy = h * 0.46;

      // Mix of edge + interior points for dense cloud fill
      const edgePts = generateHeartPath(cx, cy, heartScale, HEART_SAMPLES);
      const interiorPts = generateInteriorPoints(cx, cy, heartScale, HEART_SAMPLES);
      heartPathRef.current = [...edgePts, ...interiorPts];

      // Generate sprites
      spritesRef.current = createSprites(dpr);
      spriteMetricsRef.current = spritesRef.current.map((s) => ({
        sw: s.width / dpr,
        sh: s.height / dpr,
      }));

      // Initialize particle pool
      const count = isSubtle
        ? SUBTLE_PARTICLES
        : Math.floor(MAX_PARTICLES * density);
      const totalTargets = heartPathRef.current.length;
      const pool: Particle[] = [];

      for (let i = 0; i < count; i++) {
        // Distribute ~70% on heart, ~30% drifting nearby for ambient haze
        const onHeart = Math.random() < 0.7;
        const targetIdx = Math.floor(Math.random() * totalTargets);
        const target = heartPathRef.current[targetIdx];

        pool.push({
          x: onHeart ? target.x + (Math.random() - 0.5) * 40 : Math.random() * w,
          y: onHeart ? target.y + (Math.random() - 0.5) * 40 : Math.random() * h,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          size: 0.3 + Math.random() * 1.3,
          seed: Math.random() * 6283,
          targetIdx,
          baseOpacity: 0.15 + Math.random() * 0.55,
          spriteIdx: Math.floor(Math.random() * 4),
          shimmerPhase: Math.random() * Math.PI * 2,
        });
      }
      particlesRef.current = pool;
    };

    window.addEventListener("resize", resize);
    resize();

    const render = (time: number) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.1);
      lastTimeRef.current = time;

      const { w, h } = metricsRef.current;
      const { opacity: opac, isSubtle: subtle, wpm: currentWpm } = propsRef.current;
      const t = time * 0.001;
      const wpmAgitation = 1 + Math.min(currentWpm, 200) * 0.003;
      const noiseStrength = subtle ? 8 : 18 * wpmAgitation;
      const attractForce = subtle ? 0.015 : 0.04;
      const friction = subtle ? 2.5 : 2.0;

      // Fade: clear with translucent background to leave soft trails
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = subtle
        ? "rgba(255, 240, 245, 0.55)"
        : "rgba(255, 240, 245, 0.22)";
      ctx.fillRect(0, 0, w, h);

      // Use "multiply" for gentle shimmering on a light background
      ctx.globalCompositeOperation = "multiply";

      const heartPath = heartPathRef.current;
      const particles = particlesRef.current;
      const sprites = spritesRef.current;
      const sMetrics = spriteMetricsRef.current;
      const totalTargets = heartPath.length;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // ── 1. Attractor Force (soft spring to heart point) ──
        const target = heartPath[p.targetIdx];
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

        // Soft elastic — closer particles feel less pull (prevents clustering)
        const pull = Math.min(dist * attractForce, 3.0);
        p.vx += (dx / dist) * pull * dt * 60;
        p.vy += (dy / dist) * pull * dt * 60;

        // ── 2. Swarm Flow Noise ──
        const nx = flowNoise(p.x, p.y, t, p.seed) * noiseStrength;
        const ny = flowNoise(p.y, p.x, t * 0.7, p.seed + 100) * noiseStrength;
        p.vx += nx * dt;
        p.vy += ny * dt;

        // ── 3. Friction ──
        p.vx *= 1 - friction * dt;
        p.vy *= 1 - friction * dt;

        // ── 4. Integration ──
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // ── 5. Shimmer / sparkle modulation ──
        const shimmer = 0.5 + 0.5 * Math.sin(t * 2.5 + p.shimmerPhase);
        const alpha = p.baseOpacity * shimmer * opac * (subtle ? 0.35 : 0.85);

        // ── 6. Draw ──
        const sprite = sprites[p.spriteIdx];
        const sm = sMetrics[p.spriteIdx];
        if (sprite && sm) {
          const drawW = sm.sw * p.size;
          const drawH = sm.sh * p.size;
          ctx.globalAlpha = alpha;
          ctx.drawImage(sprite, p.x - drawW / 2, p.y - drawH / 2, drawW, drawH);
        }

        // ── 7. Slowly migrate target for organic flow ──
        if (Math.random() < 0.005) {
          p.targetIdx = (p.targetIdx + 1 + Math.floor(Math.random() * 3)) % totalTargets;
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []); // Stable loop — props read through ref

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 pointer-events-none", className)}
    />
  );
});

// ─── Ambient Wisps (CSS-only, zero-CPU) ────────────────────────────────────

const WISP_STYLES = `
  @keyframes velvet-drift {
    0% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(40px, -30px, 0) scale(1.08); }
    100% { transform: translate3d(0, 0, 0) scale(1); }
  }
`;

const VelvetWisps = memo(function VelvetWisps() {
  return (
    <>
      <style>{WISP_STYLES}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full transform-gpu"
          style={{
            width: "60vw",
            height: "60vw",
            left: "-15%",
            top: "-10%",
            background: "radial-gradient(circle, rgba(255,180,200,0.14) 0%, transparent 70%)",
            filter: "blur(80px)",
            animation: "velvet-drift 35s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          className="absolute rounded-full transform-gpu"
          style={{
            width: "50vw",
            height: "50vw",
            right: "-10%",
            bottom: "-5%",
            background: "radial-gradient(circle, rgba(232,55,90,0.08) 0%, transparent 70%)",
            filter: "blur(90px)",
            animation: "velvet-drift 45s ease-in-out infinite reverse",
            willChange: "transform",
          }}
        />
        <div
          className="absolute rounded-full transform-gpu"
          style={{
            width: "40vw",
            height: "40vw",
            left: "30%",
            top: "25%",
            background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 65%)",
            filter: "blur(70px)",
            animation: "velvet-drift 50s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      </div>
    </>
  );
});

// ─── Noise Overlay ──────────────────────────────────────────────────────────

const NoiseOverlay = memo(function NoiseOverlay() {
  return (
    <div
      className="absolute inset-0 opacity-[0.025] pointer-events-none mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    />
  );
});

// ─── Main Background Component ──────────────────────────────────────────────

export const VelvetMercuryBackground = memo(function VelvetMercuryBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#fff0f5]">
      {/* Soft radial centre glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.85)_0%,transparent_70%)]" />

      <VelvetWisps />
      <VelvetMercuryParticles />

      {/* Depth vignette — very gentle pink tint at edges */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(255,200,215,0.12)_100%)] pointer-events-none" />

      <NoiseOverlay />
    </div>
  );
});
