# Monetization Model Plan: TypeRead

## 1. Core Philosophy
TypeRead will remain **completely free-to-play**. The core experience—uploading books, typing, and analytics—will never be locked behind a paywall. Monetization will focus exclusively on **player expression, ambiance, and companionship** through high-quality cosmetics.

- **Non-Invasive:** No "pay-to-win" mechanics or speed boosts.
- **Atmospheric:** Cosmetics should enhance the "zen" and focus of the typing experience.
- **Value-Driven:** Premium items should feel hand-crafted (e.g., bespoke pixel art, custom soundscapes).

---

## 2. Paid Cosmetics: Themes & Ambiance
Expanding beyond the basic "Dark/Light" modes to create immersive typing environments.

### 2.1 Premium Themes
*   **Dynamic Backgrounds:** Themes with subtle, non-distracting animations (e.g., falling snow, a rain-streaked window, a moving nebula, or a flickering fireplace).
*   **Soundscapes:** Themes bundled with custom ambient loops (Lofi beats, forest sounds, typewriter mechanical clicks).
*   **Custom UI Sets:** Complete overrides for HUD elements, borders, and buttons (e.g., a "Vintage" theme with brass textures and parchment paper).

### 2.2 Text & Caret FX
*   **Caret Trails:** The cursor leaves a fading "ghost" or "particle" trail as it moves.
*   **Keystroke Animations:** Visual feedback on the characters themselves (e.g., letters glowing briefly, "exploding" into pixels, or floating up when typed correctly).
*   **Typography Packs:** Exclusive, highly legible fonts curated for different reading/typing styles.

---

## 3. The Companion System: "TypeBuddies"
A companion system designed to give the user a sense of "co-working" and encouragement.

### 3.1 Mechanics & Behavior
*   **Placement:** Pets walk along the top of the HUD or sit on the "ledge" of the typing area.
*   **Dynamic Feedback:**
    *   **Speed Reactivity:** If the user hits a high WPM burst, the pet might start running or cheering.
    *   **Accuracy Reactivity:** If an error is made, the pet might look "concerned" (e.g., a sweat drop emoji) but quickly transition to an "encouraging" animation.
    *   **Idle Behavior:** When the user stops typing, the pet might nap, read its own tiny book, or wave.

### 3.2 Pet Profiles (Progression)
Instead of a traditional leveling system, each pet has a dedicated **Pet Profile** that tracks the user's history with that specific companion:
*   **Words Typed Together:** A lifetime counter of all words typed while that pet was active.
*   **Adoption Date:** When the pet was first unlocked/purchased.
*   **Milestones:** Visual badges on the profile for reaching certain word counts (e.g., 10k, 50k, 100k words).

### 3.3 Pet Types
*   **Basic Pets:** Free/Achievement-based (e.g., Cat, Dog, Owl).
*   **Premium Pets:** Unique pixel art designs (e.g., Dragon, Robot, Ghost).

---

## 4. Currency, Security & Account System

### 4.1 "Ink" (Premium) vs. "Pages" (Earned)
*   **Pages (Soft Currency):** Earned by typing. Stored locally but synced to account. Used for basic unlocks.
*   **Ink (Hard Currency):** Purchased via a secure checkout. Used for Premium cosmetics.

### 4.2 Security & Verification
To prevent users from manually editing local database files to "unlock" premium content:
*   **Server-Side Source of Truth:** All "Ink" balances and "Premium Unlock" flags must be stored on a central backend (e.g., Supabase, Firebase, or a custom Rust API).
*   **Authentication:** Users must sign in to access purchased content.
*   **Entitlement Checks:** The app will verify the user's ownership of a premium ID (e.g., `theme_nebula_01`) with the server upon launch and periodic refreshes.

---

## 5. Phase-based Rollout Plan

| Phase | Focus | Deliverables |
| :--- | :--- | :--- |
| **Phase 1** | **Backend & Auth** | Setup centralized account system (Auth), remote DB for user metadata/unlocks. |
| **Phase 2** | **Foundation** | In-game Shop UI, Soft Currency (Pages) logic, Pet Profile tracking. |
| **Phase 3** | **Visual Flair** | Caret FX, Keystroke animations, and first set of TypeBuddies. |
| **Phase 4** | **PvE Expansion** | Cosmetics visible in **Versus Mode** (Player vs Bot) and premium dynamic themes. |

---

## 🛑 Decisions & Constraints
*   **No Audio:** Soundscapes and audio-based feedback are excluded from the current vision to maintain the "zen" focus.
*   **PvE Only:** Versus mode is strictly Player vs. Bot for now; no real-time PvP synchronization is required.
*   **Security First:** No premium content should be fully "local" to prevent unauthorized unlocks.

---

## 6. Cost-Effective Infrastructure
To maintain a high user capacity while keeping costs at or near zero during the growth phase, the following stack is recommended:

### 6.1 Backend & Database: Supabase
*   **Why:** Supabase offers an extremely generous **Free Tier** that includes:
    *   **Authentication:** Up to 50,000 Monthly Active Users (MAU).
    *   **Database:** 500MB of PostgreSQL (enough for millions of "unlock" rows).
    *   **Edge Functions:** For secure server-side logic (e.g., verifying a purchase).
*   **Scalability:** If you outgrow the free tier, the "Pro" plan is a flat $25/month, which is very affordable for a successful app.

### 6.2 Payments: Stripe
*   **Why:** Stripe uses a **Pay-as-you-go** model. There are no monthly fees; they only take a small percentage of each transaction. 
*   **Security:** Handles all PCI compliance and sensitive credit card data.

---

## 🚀 Next Steps
1.  **Backend Setup:** Initialize a Supabase project and define the `profiles` and `unlocked_items` tables.
2.  **Auth Integration:** Implement a "Sign In / Sign Up" flow in the Tauri app.
3.  **Sync Logic:** Update the `typing_sessions` logic to sync summary data (total words) to the server to update Pet Profiles securely.
