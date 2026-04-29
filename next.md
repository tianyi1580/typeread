sound effects?
progression unlocks
short story first book?
Monetization model?
keyboard error heatmap

Ran command: `npm run tauri dev
`

Here are several creative ideas you can add to level progression unlocks in **typeread**, categorized by how they impact the user experience:

### 🎨 1. Enhanced Cosmetics & Personalization
*   **Caret Styles**: Unlock different caret behaviors (e.g., *Pulse*, *Block*, *Blinking Underline*, or a *Rainbow Trail*).
*   **Keypress Sound Effects**: Unlock sound packs (e.g., *Vintage Typewriter*, *Thocky Mechanical*, *Chippy 8-Bit*, or *Raindrops*).
*   **Ambient Backgrounds**: Unlock subtle background animations (e.g., drifting stars, glowing grids, or moving gradients) that aren't distracting but feel premium.

### 📊 2. Deep Analytics & Stats
*   **Keyboard Error Heatmap**: A visual map of the physical keyboard showing which specific keys the user makes the most mistakes on (unlocked at a higher level).
*   **Historical Breakdown Graphs**: Unlocking long-term charts like "WPM over the last 6 months" or "Accuracy by hour of day."
*   **Finger Speed Analysis**: Insights into which hand/finger groups type the fastest.

### 🕹️ 3. Gameplay & "Versus" Mode
*   **Advanced Bot Personalities**: Unlock ghost bots that simulate real historical typists, or adaptive bots that match the user's average WPM + 5 to push them.
*   **Survival/Hardcore Mode**: Unlock a "Sudden Death" module for practice runs where getting a single error immediately fails the test.
*   **Blind/Fog Mode**: The text slowly fades away ahead of the cursor, forcing the user to read and memorize chunks ahead instead of looking at the letter they are on.

### 📚 4. Content & Library
*   **Specialty Word Banks**: Practice bundles beyond `easy`/`medium`/`hard` (e.g., *JavaScript/Rust Code Snippets*, *Legal Terminology*, or *Classic Book Quotes*).
*   **Custom Book Covers**: The ability to modify/upload high-res custom thumbnail assets for downloaded `.epub` files.

### 🛠️ Example Quick-Add Implementation Idea:
If you want to lock down something like **"Thocky Audio"**, you would:
1. Add `thockyAudio: boolean` to `UnlockState` in [types.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/types.ts).
2. Wire the unlock evaluation into `unlocksForLevel` in [progression.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/progression.ts).