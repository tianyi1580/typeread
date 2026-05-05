import React, { useMemo, useRef, useEffect, memo } from "react";

/**
 * Shared keyframes for the nebula theme.
 * Using hardware-accelerated properties only (transform, opacity).
 */
const NEBULA_STYLES = `
  @keyframes nebula-float {
    0% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
    33% { transform: translate3d(60px, -50px, 0) scale(1.1) rotate(5deg); }
    66% { transform: translate3d(-60px, 50px, 0) scale(0.9) rotate(-5deg); }
    100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  }
`;

export const NebulaBackground = memo(function NebulaBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#050614]">
      <style>{NEBULA_STYLES}</style>

      {/* Deep Space Base */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#0a0b1e_0%,#050614_100%)]" />

      {/* High-performance Canvas Starfield Layers - Restored depth */}
      <CelestialParticles count={170} size={2} opacity={0.4} speed={80} />
      <CelestialParticles count={85} size={3} opacity={0.6} speed={60} twinkle />

      {/* Dynamic Nebula Blobs - Optimized with smaller base size + scale to reduce blur cost */}
      <NebulaBlob
        color="rgba(147, 51, 234, 0.18)"
        size="70vw"
        initialX="-10%"
        initialY="-10%"
        duration={45}
      />
      <NebulaBlob
        color="rgba(30, 64, 175, 0.15)"
        size="80vw"
        initialX="40%"
        initialY="20%"
        duration={60}
      />
      <NebulaBlob
        color="rgba(219, 39, 119, 0.1)"
        size="60vw"
        initialX="10%"
        initialY="50%"
        duration={50}
      />
      <NebulaBlob
        color="rgba(79, 70, 229, 0.15)"
        size="75vw"
        initialX="-5%"
        initialY="35%"
        duration={55}
      />

      {/* Static Noise Overlay - Memoized to prevent re-calculations */}
      <NoiseOverlay />

      {/* Depth Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(5,6,20,0.5)_100%)] pointer-events-none" />
    </div>
  );
});

const NoiseOverlay = memo(function NoiseOverlay() {
  return (
    <div
      className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    />
  );
});

interface CelestialParticleProps {
  count?: number;
  size?: number;
  opacity?: number;
  speed?: number;
  twinkle?: boolean;
}

/**
 * High-performance Starfield using 2D Canvas.
 * This replaces 400+ DOM elements with a single draw call loop.
 */
export const CelestialParticles = memo(function CelestialParticles({
  count = 400,
  size: baseSize = 1,
  opacity: baseOpacity = 0.5,
  speed = 80,
  twinkle: enableTwinkle = true
}: CelestialParticleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const createSprites = () => {
      const dpr = window.devicePixelRatio || 1;
      const sizes = [baseSize * 0.7, baseSize * 1.3];
      spritesRef.current = sizes.map(s => {
        const spriteCanvas = document.createElement("canvas");
        const glowSize = s * 8;
        const physicalSize = Math.ceil(glowSize * 2 * dpr);
        spriteCanvas.width = physicalSize;
        spriteCanvas.height = physicalSize;

        const sCtx = spriteCanvas.getContext("2d");
        if (sCtx) {
          sCtx.scale(dpr, dpr);
          const center = glowSize;
          const gradient = sCtx.createRadialGradient(center, center, 0, center, center, glowSize);
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
          gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.08)");
          gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.03)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

          sCtx.fillStyle = gradient;
          sCtx.fillRect(0, 0, glowSize * 2, glowSize * 2);

          sCtx.fillStyle = "rgba(255, 255, 255, 1)";
          sCtx.beginPath();
          sCtx.arc(center, center, s * 0.8, 0, Math.PI * 2);
          sCtx.fill();
        }
        return spriteCanvas;
      });
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      createSprites();
    };

    window.addEventListener("resize", resize);
    resize();

    const speedMultiplier = (speed || 80) / 80;
    const stars = Array.from({ length: count }).map(() => {
      const isLarge = Math.random() > 0.8;
      const s = isLarge ? baseSize * 1.3 : baseSize * 0.7;
      return {
        x: Math.random() * 100,
        y: Math.random() * 100,
        spriteIdx: isLarge ? 1 : 0,
        glowSize: s * 8,
        opacity: (baseOpacity * 0.3) + Math.random() * (baseOpacity * 0.7),
        twinkleDuration: 6 + Math.random() * 4,
        twinklePhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 50 * speedMultiplier,
        driftY: (Math.random() - 0.5) * 50 * speedMultiplier,
        driftFreq: 0.1 + Math.random() * 0.2,
      };
    });

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = time * 0.001;

      for (let i = 0; i < count; i++) {
        const s = stars[i];
        const xOffset = Math.sin(t * s.driftFreq + i) * s.driftX;
        const yOffset = Math.cos(t * s.driftFreq + i) * s.driftY;

        const x = (s.x / 100) * width + xOffset;
        const y = (s.y / 100) * height + yOffset;

        const twinkle = enableTwinkle
          ? Math.sin((t * Math.PI * 2) / s.twinkleDuration + s.twinklePhase)
          : 0.5;
        const currentOpacity = s.opacity * (0.6 + twinkle * 0.4);

        const sprite = spritesRef.current[s.spriteIdx];
        if (sprite) {
          ctx.globalAlpha = currentOpacity;
          const glowSize = s.glowSize;
          ctx.drawImage(sprite, x - glowSize, y - glowSize, glowSize * 2, glowSize * 2);
        }
      }
      ctx.globalAlpha = 1.0;

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [count, baseSize, baseOpacity, speed, enableTwinkle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
});
const NebulaBlob = memo(function NebulaBlob({
  color,
  size,
  initialX,
  initialY,
  duration
}: {
  color: string,
  size: string,
  initialX: string,
  initialY: string,
  duration: number
}) {
  return (
    <div
      className="absolute rounded-full pointer-events-none transform-gpu"
      style={{
        width: size,
        height: size,
        left: initialX,
        top: initialY,
        background: `radial-gradient(circle, ${color} 0%, transparent 75%)`,
        // Using a combination of blur and opacity for better perf than heavy blur alone
        filter: "blur(80px)",
        opacity: 0.8,
        mixBlendMode: "screen",
        animation: `nebula-float ${duration}s ease-in-out infinite`,
        willChange: "transform",
      } as React.CSSProperties}
    />
  );
});
