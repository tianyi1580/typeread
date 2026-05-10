sound effects?
short story first book?
Monetization model?
zen mode - no need to type caps or punctuation?
    doesnt show if you get a character right or wrong

graphics settings?
remove transition time analytics involving spacebar
Read text color


progression unlocks:

themes:
snowfall
pixel art
    sunset
    pizza
    cats
sakura tree
SRL

Pets:
kaylie white cat


### Summary of Premium Caret Concepts:

*   **Nebula Drift: "Cosmic Pulse"**
    *   **The Vibe:** Ethereal and celestial.
    *   **Mechanic:** A soft purple-to-indigo gradient bar with a "breathing" glow. As it moves, it leaves a micro-trail of stardust (tiny, fast-fading particles) to give a sense of cosmic momentum.

*   **Rainy Window: "Liquid Bead"**
    *   **The Vibe:** Calm and tactile.
    *   **Mechanic:** A semi-transparent teal bar that mimics a water streak. It features a subtle rippling shimmer and uses a "stretch and snap" animation (like breaking surface tension) when jumping between words, followed by a microscopic splash effect.
    *   **Implementation Plan:**
        1.  **CSS Foundation:** Define `.caret-liquid-bead` with a teal-to-cyan gradient and a custom `shimmer` animation.
        2.  **Surface Tension Physics:** Use a high-damping spring for character movement, but a "stretch" effect (temporary height/width scale) during word jumps to simulate breaking surface tension.
        3.  **Splash Particles:** Implement a "splash" emission in `TypingLayer.tsx` that triggers on word completion or line jumps. Particles will be teal-tinted droplets with gravity and physics.
        4.  **Performance:** Reuse the pre-allocated `particlePool` and intelligent animation lifecycle established during the Cosmic Pulse audit.

*   **Satin Heart: "Silk Glint"**
    *   **The Vibe:** Elegant and refined.
    *   **Mechanic:** A vibrant crimson-to-rose gradient bar with tapered ends, giving it a needle-like look. A sharp white "glint" of light occasionally slides along its length, and its movement is governed by a high-tension spring that feels like it's being pulled by silk thread.
