import React, { useRef, useEffect, memo } from "react";
import { cn } from "../lib/utils";

// ─── Configuration & Types ──────────────────────────────────────────────────

/** Maximum hearts at full density. Reader uses isSubtle for reduced count. */
const MAX_HEARTS = 55;
const SUBTLE_HEARTS = 18;

interface FloatingHeart {
  x: number;
  y: number;
  vx: number; // Sway amplitude
  vy: number; // Upward speed
  currentVx: number; // Real-time x velocity
  currentVy: number; // Real-time y velocity
  size: number;
  spriteIdx: number;
  phase: number;
  rot: number;
  rotV: number;
  baseOpacity: number;
  depth: number;
}

// ─── Sprite Generation ──────────────────────────────────────────────────────

/**
 * Pre-renders 5 soft heart sprites to off-screen canvases.
 */
function createHeartSprites(dpr: number): HTMLCanvasElement[] {
  const configs = [
    { color: "rgba(255, 182, 193, 0.9)", blur: 0, scale: 1.2 },    // Soft pink
    { color: "rgba(255, 105, 180, 0.8)", blur: 2, scale: 1.0 },    // Hot pink
    { color: "rgba(219, 112, 147, 0.95)", blur: 1, scale: 0.9 },   // Pale violet red
    { color: "rgba(232, 55, 90, 0.85)", blur: 0, scale: 0.8 },     // Crimson accent
    { color: "rgba(255, 240, 245, 0.95)", blur: 4, scale: 1.4 },   // Glowing blush/white
  ];

  return configs.map(({ color, blur, scale }) => {
    const heartScale = 1.5 * scale;
    const pad = 12 + blur * 2;
    // Bounding box for the parametric heart is roughly [-16, 16] for X and [-17, 12] for Y.
    const width = 32 * heartScale + pad * 2;
    const height = 30 * heartScale + pad * 2;

    const c = document.createElement("canvas");
    c.width = Math.ceil(width * dpr);
    c.height = Math.ceil(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return c;

    ctx.scale(dpr, dpr);

    // Center it (compensating slightly for the bounding box offset)
    ctx.translate(width / 2, height / 2 + 2.5 * heartScale);

    if (blur > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2; t += 0.05) {
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      if (t === 0) ctx.moveTo(hx * heartScale, hy * heartScale);
      else ctx.lineTo(hx * heartScale, hy * heartScale);
    }
    ctx.fill();

    return c;
  });
}

interface SpriteMetric {
  sw: number;
  sh: number;
}

// ─── SatinHeartParticles ─────────────────────────────────────────────────

export const SatinHeartParticles = memo(function SatinHeartParticles({
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
  const heartsRef = useRef<FloatingHeart[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const spriteMetricsRef = useRef<SpriteMetric[]>([]);
  const metricsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastTimeRef = useRef(0);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false, lastMoveAt: 0 });

  // Smooth props access
  // Smooth props access
  const propsRef = useRef({ density, opacity, isSubtle, wpm });
  // Sync props to ref for the render loop
  propsRef.current = { density, opacity, isSubtle, wpm };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
      mouseRef.current.lastMoveAt = Date.now();
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

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

      spritesRef.current = createHeartSprites(dpr);
      spriteMetricsRef.current = spritesRef.current.map((s) => ({
        sw: s.width / dpr,
        sh: s.height / dpr,
      }));

      const count = isSubtle
        ? SUBTLE_HEARTS
        : Math.floor(MAX_HEARTS * density);

      const pool: FloatingHeart[] = [];

      for (let i = 0; i < count; i++) {
        pool.push({
          x: Math.random() * w,
          y: Math.random() * h, // Initial random spread across screen
          vx: 0.2 + Math.random() * 0.8, // Sway amplitude
          vy: 20 + Math.random() * 50, // Upward speed
          currentVx: 0,
          currentVy: -(20 + Math.random() * 50),
          size: 0.4 + Math.random() * 1.0,
          spriteIdx: Math.floor(Math.random() * 5),
          phase: Math.random() * Math.PI * 2,
          rot: (Math.random() - 0.5) * 0.5, // Initial rotation
          rotV: (Math.random() - 0.5) * 0.02, // Rotation velocity
          baseOpacity: 0.4 + Math.random() * 0.6,
          depth: 0.3 + Math.random() * 0.7,
        });
      }
      heartsRef.current = pool;
    };

    window.addEventListener("resize", resize);
    resize();

    const render = (time: number) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.1);
      lastTimeRef.current = time;

      const { w, h } = metricsRef.current;
      const { opacity: opac, isSubtle: subtle, wpm: currentWpm } = propsRef.current;
      const t = time * 0.001;
      const now = Date.now();
      const mouse = mouseRef.current;

      // Disable mouse tracking if idle for 1 seconds
      if (mouse.active && now - mouse.lastMoveAt > 1000) {
        mouse.active = false;
      }

      // Clear canvas fully every frame
      ctx.clearRect(0, 0, w, h);

      const hearts = heartsRef.current;
      const sprites = spritesRef.current;
      const sMetrics = spriteMetricsRef.current;

      for (let i = 0; i < hearts.length; i++) {
        const p = hearts[i];

        const speedBoost = 1 + Math.min(currentWpm, 150) * 0.005;

        // Base idle velocities
        let idealVx = Math.sin(t * 1.5 + p.phase) * (p.vx * p.depth) * speedBoost * 60;
        let idealVy = -p.vy * p.depth * speedBoost;

        if (mouse.active) {
          const mdx = mouse.x - p.x;
          const mdy = mouse.y - p.y;
          const dist = Math.sqrt(mdx * mdx + mdy * mdy);

          // Significantly dampen the natural upward float and sway when tracking
          idealVy *= 0.15;
          idealVx *= 0.3;

          if (dist > 5) {
            // Stronger attraction pull, scaled by depth so distant hearts still feel heavier
            const pull = 50 * p.depth;
            idealVx += (mdx / dist) * pull;
            idealVy += (mdy / dist) * pull;
          }
        } else {
          // Horizontal repulsion to spread out if clumped (only when not tracking)
          for (let j = 0; j < hearts.length; j++) {
            if (i === j) continue;
            const other = hearts[j];
            const dx = p.x - other.x;
            const dy = p.y - other.y;
            const distSq = dx * dx + dy * dy;
            const minDist = 70;
            if (distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq) || 0.1;
              const force = (minDist - dist) / minDist;
              // Apply horizontal repulsion to spread them out
              idealVx += (dx / dist) * force * 120 * p.depth;
              // Minor vertical repulsion to help de-clumping
              idealVy += (dy / dist) * force * 40 * p.depth;
            }
          }
        }

        // Smoothly interpolate current velocity towards ideal velocity
        const lerpFactor = mouse.active ? 2.5 : 1.5;
        p.currentVx += (idealVx - p.currentVx) * dt * lerpFactor;
        p.currentVy += (idealVy - p.currentVy) * dt * lerpFactor;

        // Apply velocities
        p.x += p.currentVx * dt;
        p.y += p.currentVy * dt;
        p.rot += p.rotV * dt * 60;

        // Wrap around gracefully if out of bounds
        if (p.y < -150 && p.currentVy < 0) {
          p.y = h + 100;
          p.x = Math.random() * w;
        } else if (p.y > h + 150 && p.currentVy > 0) {
          p.y = -100;
          p.x = Math.random() * w;
        }

        if (p.x < -150) {
          p.x = w + 100;
        } else if (p.x > w + 150) {
          p.x = -100;
        }

        // Draw
        const sprite = sprites[p.spriteIdx];
        const sm = sMetrics[p.spriteIdx];
        if (sprite && sm) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);

          // Gentle pulse
          const pulse = 1 + 0.03 * Math.sin(t * 2 + p.phase);
          const renderScale = p.size * p.depth * pulse;

          ctx.globalAlpha = p.baseOpacity * opac * (subtle ? 0.35 : 1.0);
          ctx.scale(renderScale, renderScale);

          ctx.drawImage(sprite, -sm.sw / 2, -sm.sh / 2, sm.sw, sm.sh);
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animId);
    };
  }, [density, isSubtle]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 pointer-events-none", className)}
    />
  );
});

// ─── Ambient Wisps (CSS-only, zero-CPU) ────────────────────────────────────

const WISP_STYLES = `
  @keyframes satin-drift {
    0% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(40px, -30px, 0) scale(1.08); }
    100% { transform: translate3d(0, 0, 0) scale(1); }
  }
`;

const SatinHeartWisps = memo(function SatinHeartWisps() {
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
            animation: "satin-drift 35s ease-in-out infinite",
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
            animation: "satin-drift 45s ease-in-out infinite reverse",
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
            animation: "satin-drift 50s ease-in-out infinite",
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

export const SatinHeartBackground = memo(function SatinHeartBackground({
  density = 1,
}: {
  density?: number;
}) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#fff0f5]">
      {/* Soft radial centre glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.85)_0%,transparent_70%)]" />

      <SatinHeartWisps />
      <SatinHeartParticles density={density} />

      {/* Depth vignette — very gentle pink tint at edges */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(255,200,215,0.12)_100%)] pointer-events-none" />

      <NoiseOverlay />
    </div>
  );
});
