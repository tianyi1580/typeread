import { useMemo } from "react";
import { motion } from "framer-motion";

export function NebulaBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#050614]">
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
  interactive?: boolean;
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
      // Larger drift range for more expansive motion
      driftX: (Math.random() - 0.5) * 350,
      driftY: (Math.random() - 0.5) * 350,
    }));
  }, [count, speed]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            width: size,
            height: size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity,
            boxShadow: twinkle ? `0 0 ${size * 3}px rgba(255, 255, 255, 0.6)` : "none",
            willChange: "transform, opacity",
          }}
          animate={{
            opacity: twinkle ? [opacity, opacity * 0.1, opacity] : opacity,
            scale: twinkle ? [1, 1.25, 1] : 1,
            // Smooth floating motion
            x: [0, p.driftX, 0],
            y: [0, p.driftY, 0],
          }}
          transition={{
            duration: speed,
            repeat: Infinity,
            ease: "linear", // Linear is actually better for "constant" drifting motion
            delay: -p.delay,
            opacity: twinkle ? { duration: 3 + p.twinkleDelay, repeat: Infinity, ease: "easeInOut" } : undefined,
            scale: twinkle ? { duration: 4 + p.twinkleDelay, repeat: Infinity, ease: "easeInOut" } : undefined,
          }}
        />
      ))}
    </div>
  );
}

function NebulaBlob({ color, size, initialX, initialY, duration }: { color: string, size: string, initialX: string, initialY: string, duration: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        left: initialX,
        top: initialY,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: "blur(120px)",
        willChange: "transform",
        mixBlendMode: "screen",
      }}
      animate={{
        x: [0, 120, -120, 0],
        y: [0, -100, 100, 0],
        scale: [1, 1.15, 0.85, 1],
        rotate: [0, 25, -25, 0],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
