# Everfrost Silence: Premium Snowfall Theme Vision

## 1. Aesthetic Vision
The **Everfrost Silence** theme aims to capture the serene, quiet atmosphere of a midnight snowfall. It prioritized focus and tranquility, using a cool, dark palette with high-fidelity particle effects.

### Color Palette
- **Background**: Obsidian Midnight (`#02040a`) to Deep Slate (`#0f172a`).
- **Accent/Text**: Frost White (`#f8fafc`) and Icy Cyan (`#bae6fd`).
- **Muted Text**: Glacial Slate (`#64748b`).
- **Glass Panel**: `rgba(15, 23, 42, 0.45)` with a subtle `#bae6fd10` border.

## 2. Background Implementation: `EverfrostBackground.tsx`
The background will utilize a high-performance Canvas-based snow system, similar to the `RainyWindowBackground` but with slower, more graceful physics.

### Features
- **Multi-Layered Snowfall**:
  - **Background Layer**: Small, blurry flakes moving very slowly.
  - **Midground Layer**: Standard flakes with moderate speed and opacity.
  - **Foreground Layer**: Larger, sharp flakes with detailed movement.
- **Drift Physics**: Flakes will have a horizontal "sway" (sine wave oscillation) to simulate light wind.
- **Atmospheric Depth**:
  - Soft Indigo-Slate radial gradients (`#1e293b`) to create perceived depth.
  - A "Frost Vignette" (`#bae6fd05`) around the screen edges using a subtle SVG noise filter.

## 3. Premium Caret Animation: "Frost Trail"
The "Frost Trail" caret is designed to feel crystalline and responsive.

### Visual Style
- **Caret**: A sleek, two-pixel wide frost-white bar (`#f8fafc`) with a soft `#7dd3fc` outer glow (breathing effect).
- **Particles ("Crystal Flurry")**:
  - **Emission**: Triggered by caret movement (typing).
  - **Sprites**: Pre-rendered six-sided snowflake sprites (3-4 variations).
  - **Behavior**: Particles tumble (rotate) as they fall, with a slight downward drift.
  - **Decay**: Smooth opacity fade-out over 1-1.5 seconds.

## 4. Technical Blueprint
- **Store Integration**: Add `everfrost-silence` to `Theme` type and settings.
- **Component**: Create `EverfrostBackground.tsx` using the `CelestialParticles` pattern from Nebula for the flakes (optimized sprite rendering).
- **Caret Logic**: Update `TypingLayer.tsx` to handle `everfrost-silence` particle emission:
  - Add `isSnow` flag to the particle pool.
  - Implement the "gust" scatter logic for vertical jumps.
  - Use `drawImage` with pre-rendered snowflake canvases in `CaretTrail`.

## 5. Summary of Premium Themes Comparison

| Theme | Background Vibe | Caret Effect | Particle Logic |
| :--- | :--- | :--- | :--- |
| **Nebula Drift** | Cosmic, floating blobs | Cosmic Pulse | Stardust (glows, no gravity) |
| **Rainy Window** | Weather, splats, lightning | Liquid Bead | Water splashes (side-ways, stretch) |
| **Satin Heart** | Soft, romantic, pink | Silk Glint | Floating hearts (upward drift) |
| **Everfrost Silence** | Serene, cold, midnight | Frost Trail | Crystal flakes (tumble, downward drift) |
