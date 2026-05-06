# Implementation Plan: Velvet Mercury Theme (Ethereal Swarm)

## 1. Aesthetic Goal
- **Color Palette**: 
  - Background: Light Pink (`#fff0f5` / `rgba(255, 240, 245, 1)`)
  - Accent: Vibrant Red (`#ff2d55`) / Clean White (`#ffffff`)
  - Glows: Soft Magenta and Pink gradients.
- **Central Feature**: A shimmering, flowy heart shape formed entirely by a dense swarm of tiny ethereal particles (krill/fish school style).
- **Atmosphere**: Gentle sparkles, wispy flow lines, and an "edge-less" organic feel.
- **ReaderView**: Extremely subtle, reducing swarm density and using high-transparency particles to ensure text clarity.

## 2. Technical Architecture

### Swarm Particle System
- **Heart Path Logic**:
  - Define a mathematical heart path (e.g., parametric heart curve).
  - Each particle has a "target point" on the path or is attracted to the nearest point on the path using a soft spring force.
  - Add **Perlin/Simplex Noise** to the particle velocities to create the "flowy" organic movement seen in swarms.
- **Zero-GC Loop**:
  - Pre-allocate a pool of 500–1000 particles.
  - Mutate properties directly in each frame.
- **Sprite-Based Rendering**:
  - Pre-render 3-4 variations of "ethereal bits" (small ovals with glow, tiny sparkles) to an offscreen canvas.
  - Draw particles using `drawImage` for maximum performance.

### Background Layers
1. **Base Layer**: Solid light pink or very soft radial gradient.
2. **Wisps Layer**: 2-3 large, slow-moving canvas wisps (bezier curves with shadow blur) to simulate gaseous flow.
3. **Swarm Layer**: The main heart-shaped particle system.
4. **Overlay**: Very subtle noise texture for premium "paper-like" depth.

## 3. Integration Plan

### src/theme.ts
- Update `velvet-mercury` color constants:
  - Background: `#fff0f5` (Lavender Blush / Light Pink)
  - Panel: `rgba(255, 255, 255, 0.7)` (Glassy White)
  - Accent: `#ff2d55` (Pinkish Red)

### src/components/VelvetMercuryBackground.tsx
- Rewrite `VelvetMercuryParticles`:
  - Implement the heart-attraction force.
  - Implement swarm behavior (cohesion/noise).
  - Pass `isSubtle` to drastically reduce particle count and speed for `ReaderView`.
- Update `VelvetMercuryBackground`:
  - New ambient glows matching the light pink theme.

### Optimization Strategy
- **Offscreen Canvas**: Only the particles will be dynamic. Background wisps can be very slow or even static CSS/SVG.
- **Density Multiplier**: Support a density setting to allow lower-end machines to reduce the particle count.
- **WPM Scaling**: Link the swarm "agitation" or noise intensity to WPM for a reactive feel.

## 4. Quality Checklist
- [ ] No sharp edges on the heart; it should feel like a cloud.
- [ ] Text in `ReaderView` must be 100% readable.
- [ ] 60 FPS on standard hardware.
- [ ] Colors feel "premium" and cohesive (not generic bubblegum pink).
