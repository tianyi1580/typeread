import React, { useRef, useEffect, memo } from "react";
import { cn } from "../lib/utils";

// --- Types & Configurations ---
interface Snowflake {
  x: number;          // Horizontal position
  y: number;          // Vertical position
  vx: number;         // Horizontal sway coefficient
  vy: number;         // Base vertical fall speed
  size: number;       // Render scale multiplier
  spriteIdx: number;  // Index of pre-rendered snowflake sprite
  phase: number;      // Phase offset for sine wave sway
  phaseSpeed: number; // Frequency of sine wave oscillation
  depth: number;      // Layer index for parallax (0.3 = back, 1.0 = front)
  rotation: number;   // Current rotation angle
  rotSpeed: number;   // Rotational velocity
  opacity: number;    // Personal opacity multiplier
}

const MAX_FLAKES = 150;
const SUBTLE_FLAKES = 45;

/** Pre-renders four distinct snowflake designs into offscreen buffers. */
function createSnowflakeSprites(dpr: number): HTMLCanvasElement[] {
  const shapes = [
    { type: "dendrite", size: 16, glow: 3, opacity: 0.9 },
    { type: "plate", size: 12, glow: 1, opacity: 0.8 },
    { type: "needle", size: 8, glow: 0, opacity: 0.95 },
    { type: "bokeh", size: 24, glow: 8, opacity: 0.4 }, // Deep blur background layer
  ];

  return shapes.map(cfg => {
    const pad = 12 + cfg.glow * 2;
    const canvasSize = cfg.size * 2 + pad * 2;
    const c = document.createElement("canvas");
    c.width = Math.ceil(canvasSize * dpr);
    c.height = Math.ceil(canvasSize * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return c;

    ctx.scale(dpr, dpr);
    ctx.translate(canvasSize / 2, canvasSize / 2);

    if (cfg.glow > 0) {
      ctx.shadowBlur = cfg.glow;
      ctx.shadowColor = "rgba(186, 230, 253, 0.45)"; // Soft Icy Cyan Glow
    }

    ctx.fillStyle = `rgba(248, 250, 252, ${cfg.opacity})`; // Frost White
    ctx.strokeStyle = `rgba(248, 250, 252, ${cfg.opacity})`;
    ctx.lineWidth = 1.2;

    const r = cfg.size;

    if (cfg.type === "dendrite") {
      // 6-sided branch snowflake
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r);
        ctx.stroke();

        // Branch barbs
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(-r * 0.25, -r * 0.7);
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(r * 0.25, -r * 0.7);
        
        ctx.moveTo(0, -r * 0.8);
        ctx.lineTo(-r * 0.18, -r * 0.92);
        ctx.moveTo(0, -r * 0.8);
        ctx.lineTo(r * 0.18, -r * 0.92);
        ctx.stroke();

        ctx.rotate(Math.PI / 3);
      }
    } else if (cfg.type === "plate") {
      // Simple crystalline hexagon star
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const x = Math.cos((i * Math.PI) / 3) * r;
        const y = Math.sin((i * Math.PI) / 3) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      // Center star lines
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos((i * Math.PI) / 3) * (r * 0.6), Math.sin((i * Math.PI) / 3) * (r * 0.6));
        ctx.stroke();
      }
    } else if (cfg.type === "needle") {
      // Clean shard crystal
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.35, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.35, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      // Foreground bokeh - soft circle gradient
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, "rgba(248, 250, 252, 0.25)");
      grad.addColorStop(0.5, "rgba(186, 230, 253, 0.08)");
      grad.addColorStop(1, "rgba(186, 230, 253, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  });
}

export const EverfrostParticles = memo(function EverfrostParticles({
  density = 1,
  opacity = 1,
  isSubtle = false,
  className,
}: {
  density?: number;
  opacity?: number;
  isSubtle?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flakesRef = useRef<Snowflake[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const metricsRef = useRef({ w: 0, h: 0, dpr: 1 });
  const propsRef = useRef({ density, opacity, isSubtle });
  const lastTimeRef = useRef(0);
  const noiseSpriteRef = useRef<HTMLCanvasElement | null>(null);

  propsRef.current = { density, opacity, isSubtle };

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

      // Pre-render snowflakes sprites
      spritesRef.current = createSnowflakeSprites(dpr);

      // Pre-render a tiny tiling noise texture to prevent color banding
      const noise = document.createElement("canvas");
      noise.width = 128;
      noise.height = 128;
      const nCtx = noise.getContext("2d");
      if (nCtx) {
        const idata = nCtx.createImageData(128, 128);
        const data = idata.data;
        for (let i = 0; i < data.length; i += 4) {
          const val = Math.random() * 255;
          data[i] = data[i+1] = data[i+2] = val;
          data[i+3] = 12; // Extremely faint overlay noise
        }
        nCtx.putImageData(idata, 0, 0);
        noiseSpriteRef.current = noise;
      }

      // Initialize snowflake array (zero allocation pool)
      const count = isSubtle ? SUBTLE_FLAKES : Math.floor(MAX_FLAKES * density);
      const pool: Snowflake[] = [];

      for (let i = 0; i < count; i++) {
        const depth = 0.2 + Math.random() * 0.8;
        pool.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (0.12 + Math.random() * 0.28) * (Math.random() > 0.5 ? 1 : -1),
          vy: 10 + Math.random() * 15, // Serene, gentle downward fall speed
          size: 0.35 + Math.random() * 0.75,
          spriteIdx: Math.floor(Math.random() * 4),
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.3 + Math.random() * 0.5,
          depth,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.01,
          opacity: 0.35 + Math.random() * 0.6,
        });
      }
      flakesRef.current = pool;
    };

    window.addEventListener("resize", resize);
    resize();

    const render = (time: number) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.1);
      lastTimeRef.current = time;

      const { w, h } = metricsRef.current;
      const { opacity: baseOpac } = propsRef.current;
      const t = time * 0.001;

      ctx.clearRect(0, 0, w, h);

      // Draw Atmospheric Background Gradient via 2D Canvas (Prevents Banding)
      const bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.85);
      bgGrad.addColorStop(0, "#080c18"); // Deep Glacial Navy
      bgGrad.addColorStop(0.6, "#030409"); // Obsidian Void
      bgGrad.addColorStop(1, "#010103");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Stamp Banding Dither
      if (noiseSpriteRef.current) {
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.35;
        for (let nx = 0; nx < w; nx += 128) {
          for (let ny = 0; ny < h; ny += 128) {
            ctx.drawImage(noiseSpriteRef.current, nx, ny);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      // Draw Vignette
      const vignette = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.7);
      vignette.addColorStop(0, "rgba(186, 230, 253, 0.0)"); 
      vignette.addColorStop(0.5, "rgba(15, 23, 42, 0.03)");
      vignette.addColorStop(1, "rgba(2, 4, 10, 0.75)"); // Subtle dark vignette border
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // Update and Draw Snowflakes
      const flakes = flakesRef.current;
      const sprites = spritesRef.current;

      for (let i = 0; i < flakes.length; i++) {
        const p = flakes[i];

        // Apply physics
        // Standard horizontal sine oscillation (serene drift)
        const sway = Math.sin(t * p.phaseSpeed + p.phase) * (p.vx * 30);
        
        p.x += sway * dt;
        p.y += (p.vy * p.depth) * dt;
        p.rotation += p.rotSpeed * dt * 60;

        // Wrap-around boundary conditions (low overhead reuse)
        if (p.y > h + 40) {
          p.y = -30;
          p.x = Math.random() * w;
        }
        if (p.x < -40) {
          p.x = w + 30;
        } else if (p.x > w + 40) {
          p.x = -30;
        }

        // Draw cached sprite
        const sprite = sprites[p.spriteIdx];
        if (sprite) {
          const sw = sprite.width / metricsRef.current.dpr;
          const sh = sprite.height / metricsRef.current.dpr;
          const renderScale = p.size * p.depth;

          ctx.save();
          // Using bitwise truncation (~~) to cast floats to integers (Avoids subpixel rendering cost)
          ctx.translate(~~p.x, ~~p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.scale(renderScale, renderScale);
          ctx.globalAlpha = p.opacity * baseOpac;
          ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
          ctx.restore();
        }
      }

      ctx.globalAlpha = 1.0;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
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

export const EverfrostBackground = memo(function EverfrostBackground({
  density = 1,
}: {
  density?: number;
}) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#020408]">
      <EverfrostParticles density={density} />
    </div>
  );
});
