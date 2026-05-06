# Implementation Plan: "Velvet Mercury" Theme

## 1. Theme Definition
- **Name**: `velvet-mercury`
- **Aesthetic**: High-gloss, metallic "chrome" pink. Features a central pulsing heart with 3D depth, floating sparkles, and occasional small hearts.
- **Color Palette**:
  - `background`: `#0f0208` (Near-black burgundy)
  - `panel`: `rgba(35, 5, 15, 0.45)` (Deep wine glass)
  - `text`: `#ffe4e6` (Soft rose)
  - `textMuted`: `#a855f7` (Muted purple/pink)
  - `accent`: `#ff2d55` (Vibrant chrome pink)
  - `accentSoft`: `rgba(255, 45, 85, 0.12)`
  - `border`: `rgba(255, 45, 85, 0.15)`

## 2. Technical Architecture (Efficiency & Performance)
To ensure zero lag and minimal thermal impact, the theme will follow the "Nebula/Rainy" optimized pattern:
- **Offscreen Sprite Rendering**: The complex "depth" heart and sparkle sprites will be rendered once to an offscreen canvas.
- **Main Loop**: The main animation loop will only perform `drawImage` operations, which are hardware-accelerated and extremely cheap.
- **Frequency Control**: Particle spawning and "echo" logic will use delta-time based throttling to maintain 60fps without CPU spikes.

## 3. Background Component (`VelvetMercuryBackground.tsx`)
### A. The "Chrome Heart" (Central)
- **Path Generation**: Precise SVG-style heart path rendered via `ctx.beginPath()`.
- **Achieving Depth (Metallic Chrome)**:
  - **Base Gradient**: Deep rose-to-red radial gradient for the core body.
  - **Specular Highlights**: Two high-contrast white/light-pink ellipses at the top "lobes" to simulate light reflecting off a curved, glossy surface.
  - **Rim Lighting**: A 2px outer glow (`shadowBlur`) in vibrant pink to separate the heart from the dark background.
  - **Internal Shading**: A crescent-shaped darker gradient at the bottom to give it a 3D spherical feel.
- **Pulsing Logic**:
  - Smooth `Math.sin(t) * 0.05` scale modulation.
  - **WPM Sync**: Pulse frequency = `base_freq + (current_wpm * 0.01)`.
- **Echoes (Expansion)**:
  - 3 layers of "pulse ripples" (hollow heart outlines).
  - Outlines expand from `scale 1.0` to `1.8` while their `globalAlpha` fades to 0.

### B. Particle System (Canvas 2D)
- **Sparkles**:
  - High-performance "cross" sprites (4-point stars).
  - Random rotation and "twinkle" (opacity oscillation).
  - **Emanation**: Particles spawn from the heart's perimeter and drift outwards with a slight "vortex" (spiral) force.
- **Tiny Hearts**:
  - Occasional (low density) small solid hearts.
  - Float upwards slowly with a "leaf-falling" sway (horizontal sine wave).

### C. Atmospherics (CSS/Canvas Hybrid)
- **Background**: Deep burgundy radial gradient centered on the heart.
- **Grain Overlay**: Subtle SVG turbulence dither to prevent banding in the dark gradients.
- **Vignette**: Soft `radial-gradient(transparent 40%, #000 100%)` to focus attention.

## 4. ReaderView Subtlety
The ReaderView implementation must be non-distracting:
- **Density Multiplier**: `0.2x` for all particles.
- **Heart Subtlety**: In ReaderView, the central heart is either:
  1. Removed entirely (leaving only the glow and sparkles).
  2. Rendered at `0.1` opacity and increased size (`200vw`), acting as a very soft, ambient "breathing" light rather than a focal point.
- **Panel Integration**: Use the `liquid-glass` styling for UI panels to ensure text remains the primary focus.

## 5. Implementation Milestones
1. **Asset Preparation**: Create offscreen canvas functions for the Chrome Heart (with depth) and Sparkles.
2. **Core Animation**: Implement the pulsing heart and the expansion echoes.
3. **Particle Engine**: Build the emanating sparkle system.
4. **Integration**: Add the theme to `themeMap`, `App.tsx`, and `ReaderView.tsx` with appropriate "subtle" flags.
