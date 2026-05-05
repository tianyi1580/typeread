import React, { useState, useEffect, useMemo, memo, useCallback } from "react";
import { cn } from "../lib/utils";

/**
 * RainParticles - Optimized parallax rain system.
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
  className
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
  const activeSplatDensity = splatDensity ?? density;

  const layers = useMemo(() => {
    const bgCount = Math.floor(100 * density);
    const midCount = Math.floor(40 * density);
    const fgCount = Math.floor(10 * density);

    return {
      bg: Array.from({ length: bgCount }).map((_, i) => ({
        id: `bg-${i}`,
        left: (i / bgCount) * 100 + (Math.random() - 0.5) * (100 / bgCount),
        duration: (1.2 + Math.random() * 0.8) / speed,
        delay: Math.random() * 3,
      })),
      mid: Array.from({ length: midCount }).map((_, i) => ({
        id: `mid-${i}`,
        left: (i / midCount) * 100 + (Math.random() - 0.5) * (100 / midCount),
        duration: (0.7 + Math.random() * 0.5) / speed,
        delay: Math.random() * 2.5,
      })),
      fg: Array.from({ length: fgCount }).map((_, i) => ({
        id: `fg-${i}`,
        left: (i / fgCount) * 100 + (Math.random() - 0.5) * (100 / fgCount),
        duration: (0.4 + Math.random() * 0.3) / speed,
        delay: Math.random() * 2,
      }))
    };
  }, [density, speed]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)} style={{ opacity }}>
      {showLightning && <LightningTrigger />}
      {showSplats && <GlassSplats density={activeSplatDensity} splatSize={splatSize} />}

      {/* Background Rain Layer */}
      <div className="absolute inset-0 scale-110 pointer-events-none" style={{ opacity: bgOpacity }}>
        {layers.bg.map((drop) => (
          <div key={drop.id} className="rain-drop" style={{ left: `${drop.left}%`, width: '1px', height: '60px' }}>
            <div className="rain-stem" style={{ animationDuration: `${drop.duration}s`, animationDelay: `${drop.delay}s`, opacity: 0.3 }} />
          </div>
        ))}
      </div>

      {/* Middle Rain Layer */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: midOpacity }}>
        {layers.mid.map((drop) => (
          <div key={drop.id} className="rain-drop" style={{ left: `${drop.left}%`, width: '1.5px', height: '100px' }}>
            <div className="rain-stem" style={{ animationDuration: `${drop.duration}s`, animationDelay: `${drop.delay}s` }} />
          </div>
        ))}
      </div>

      {/* Foreground Rain Layer */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ opacity: fgOpacity }}>
        {layers.fg.map((drop) => (
          <div key={drop.id} className="rain-drop" style={{ left: `${drop.left}%`, width: '2.5px', height: '160px' }}>
            <div className="rain-stem" style={{ animationDuration: `${drop.duration}s`, animationDelay: `${drop.delay}s`, boxShadow: '0 0 10px rgba(102, 153, 155, 0.2)' }} />
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * Isolated lightning component.
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

/**
 * GlassSplats - Manages dynamic raindrops on the glass.
 */
const GlassSplats = memo(function GlassSplats({ density = 1, splatSize = 1 }: { density?: number, splatSize?: number }) {
  const [splats, setSplats] = useState<{ id: number; x: number; y: number; r: number }[]>([]);
  const idCounter = React.useRef(0);

  const addSplat = useCallback(() => {
    const newSplat = {
      id: ++idCounter.current,
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: (1 + Math.random() * 4) * splatSize
    };
    setSplats(prev => {
      const next = [...prev, newSplat];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, [splatSize]);

  useEffect(() => {
    // Initial batch - make it feel like it's been raining already
    const initialSplats = Array.from({ length: Math.floor(15 * density) }).map(() => ({
      id: ++idCounter.current,
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: (1 + Math.random() * 4) * splatSize
    }));
    setSplats(initialSplats);

    const interval = setInterval(() => {
      if (Math.random() < 0.5 * density) {
        addSplat();
        if (Math.random() < 0.3 * density) addSplat();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [addSplat, density, splatSize]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {splats.map(splat => (
        <div
          key={splat.id}
          className="splat-drop"
          style={{
            left: `${splat.x}%`,
            top: `${splat.y}%`,
            width: `${splat.r * 2}px`,
            height: `${splat.r * 2}px`,
          }}
        />
      ))}
    </div>
  );
});

/**
 * RainyWindowBackground - Main background component.
 */
export const RainyWindowBackground = memo(function RainyWindowBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#1e293b] transform-gpu">
      <RainParticles density={1} speed={1} showLightning={true} showSplats={true} splatSize={1.5} splatDensity={0.4} />

      {/* Background Ambience Blobs - No blurring/filters for performance */}
      <div className="absolute top-[20%] left-[15%] w-[60vw] h-[60vw] bg-[#66999B]/05 rounded-full pointer-events-none" />
      <div className="absolute bottom-[25%] right-[5%] w-[50vw] h-[50vw] bg-slate-700/05 rounded-full pointer-events-none" />

      {/* Final Vignette & Grounding Ledge */}
      <div className="absolute inset-0 z-40 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(15,23,42,0.4)_100%)] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#3d2b1f] z-50 opacity-40 pointer-events-none" />
    </div>
  );
});
