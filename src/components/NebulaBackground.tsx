import { useMemo } from "react";

/**
 * Shared keyframes for the nebula theme to ensure they are defined once and reused.
 * Using hardware-accelerated properties only (transform, opacity).
 */
const NEBULA_STYLES = `
  @keyframes nebula-drift {
    0%, 100% { transform: translate3d(0, 0, 0); }
    50% { transform: translate3d(var(--drift-x), var(--drift-y), 0); }
  }
  @keyframes nebula-twinkle {
    0%, 100% { opacity: var(--base-opacity); transform: scale(1); }
    50% { opacity: calc(var(--base-opacity) * 0.15); transform: scale(1.25); }
  }
  @keyframes nebula-float {
    0% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
    33% { transform: translate3d(120px, -100px, 0) scale(1.15) rotate(15deg); }
    66% { transform: translate3d(-120px, 100px, 0) scale(0.85) rotate(-15deg); }
    100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  }
`;

export function NebulaBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#050614]">
      <style>{NEBULA_STYLES}</style>
      
      {/* Deep Space Base */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#0a0b1e_0%,#050614_100%)]" />

      {/* Persistent Starfield Layers */}
      <CelestialParticles count={300} size={1} opacity={0.5} speed={80} />
      <CelestialParticles count={100} size={2} opacity={0.7} speed={60} twinkle />

      {/* Dynamic Nebula Blobs - High-quality gas clouds */}
      <NebulaBlob
        color="rgba(147, 51, 234, 0.22)"
        size="85vw"
        initialX="-20%"
        initialY="-15%"
        duration={40}
      />
      <NebulaBlob
        color="rgba(30, 64, 175, 0.18)"
        size="100vw"
        initialX="30%"
        initialY="10%"
        duration={55}
      />
      <NebulaBlob
        color="rgba(219, 39, 119, 0.12)"
        size="75vw"
        initialX="15%"
        initialY="45%"
        duration={45}
      />
      <NebulaBlob
        color="rgba(79, 70, 229, 0.18)"
        size="95vw"
        initialX="-15%"
        initialY="40%"
        duration={50}
      />

      {/* Subtle Grain/Noise Overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Depth Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,6,20,0.6)_100%)] pointer-events-none" />
    </div>
  );
}

interface CelestialParticleProps {
  count: number;
  size: number;
  opacity: number;
  speed: number;
  twinkle?: boolean;
}

export function CelestialParticles({ count, size, opacity, speed, twinkle }: CelestialParticleProps) {
  // Memoize star positions so they don't "jump" or reset when the UI re-renders
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * speed,
      twinkleDelay: Math.random() * 5,
      duration: speed + (Math.random() - 0.5) * (speed * 0.2), // Slight variation in speed
      driftX: (Math.random() - 0.5) * 350,
      driftY: (Math.random() - 0.5) * 350,
    }));
  }, [count, speed]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Ensure styles are present even if CelestialParticles is used without NebulaBackground */}
      <style>{NEBULA_STYLES}</style>

      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute transform-gpu"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: size,
            height: size,
            "--drift-x": `${p.driftX}px`,
            "--drift-y": `${p.driftY}px`,
            animation: `nebula-drift ${p.duration}s linear infinite`,
            animationDelay: `-${p.delay}s`,
            willChange: "transform",
          } as React.CSSProperties}
        >
          <div
            className="h-full w-full rounded-full bg-white shadow-white transform-gpu"
            style={{
              opacity: twinkle ? undefined : opacity,
              boxShadow: twinkle ? `0 0 ${size * 4}px rgba(255, 255, 255, 0.85)` : "none",
              "--base-opacity": opacity,
              animation: twinkle
                ? `nebula-twinkle ${3 + p.twinkleDelay}s ease-in-out infinite`
                : "none",
              animationDelay: `-${p.delay}s`,
              willChange: twinkle ? "transform, opacity" : "auto",
            } as React.CSSProperties}
          />
        </div>
      ))}
    </div>
  );
}

function NebulaBlob({ color, size, initialX, initialY, duration }: { color: string, size: string, initialX: string, initialY: string, duration: number }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none transform-gpu"
      style={{
        width: size,
        height: size,
        left: initialX,
        top: initialY,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: "blur(120px)",
        mixBlendMode: "screen",
        animation: `nebula-float ${duration}s ease-in-out infinite`,
        willChange: "transform",
      } as React.CSSProperties}
    />
  );
}

