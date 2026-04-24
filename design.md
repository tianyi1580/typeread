# Project Name: [TBD]
**Type:** Local desktop typing and reading application.
**Goal:** Allow users to upload long-form texts (EPUB, MD, TXT) to improve typing skills via a clean, distraction-free interface, with built-in analytics and reading modes.

## 1. Architecture Stack
* **Frontend:** React + TypeScript + Vite.
* **State Management:** Zustand (optimized for rapid keystroke tracking).
* **Styling:** TailwindCSS + shadcn/ui.
* **Backend:** Rust via Tauri.
* **Database:** SQLite (local).
    * `Users/Profiles` (Settings, UI preferences, color themes).
    * `Library` (File paths, current character index, metadata).
    * `Sessions` (Typing metrics: WPM, CPM, accuracy, timestamps).

### 1.1 Database Schema (SQLite)
*   **Table: `books`**
    *   `id` (PK), `title`, `author`, `path`, `format`, `cover_path`, `current_index`, `total_chars`, `added_at`.
*   **Table: `typing_sessions`**
    *   `id` (PK), `book_id` (FK), `start_time`, `end_time`, `words_typed`, `chars_typed`, `errors`, `wpm`.


## 2. Core Features
### 2.1 File Parsing & Library (Rust)
* **Supported Formats:** `.epub` (via `epub` and `scraper` crates), `.md` (via `pulldown-cmark` crate), `.txt`.
* **Library Limit:** Soft UI limit of 5-10 active books.
* **State Persistence:** Granular saving of progress index to resume seamlessly.
* **EPUB Sanitization:** Strip all HTML styling, images, and tables. Preserve only raw text and basic paragraph markers for "Type Mode."

### 2.2 Display Modes (The Reader)
* **Mode A: Infinite Scroll (Default)**
    * Single-column text, generous margins.
    * Dynamic fading: Text far above and below the active line fades out.
* **Mode B: Classic 2-Page Spread**
    * Skeuomorphic book layout with simple CSS-based page-turn animations.
    * *Note:* Requires strict text reflow logic for window resizing.
* **Context Management:**
    * Books are loaded in **Chapter Chunks** to maintain performance.
    * **User Flow:** Select Book → Select Chapter → Start Typing/Reading.
    * **Navigation:** HUD includes "Previous Chapter" and "Next Chapter" buttons for quick jumping.

### 2.3 Interaction Modes
* **Type Mode (Loose Typing with Anchors):**
    * Uses a standard blinking typing cursor (`|`). No word block highlighting.
    * Incorrectly typed letters change color but do not halt progression.
    * **Spacebar Anchor:** Pressing space immediately snaps the cursor to the start of the next word if the user is currently "desynced" (i.e., extra characters typed).
    * **Normalization:** Smart quotes (`“`, `”`) are treated as straight quotes (`"`), and em-dashes (`—`) as double hyphens (`--`).
    * **Backspace:** Allowed globally. Once `Space` or `Enter` is pressed, it jumps to the next word but the user can go back via backspace.
    * **Skip Function:** Pressing `Enter` auto-completes the current word and jumps to the next one.
* **Read Mode:**
    * Typing engine disabled. Acts as a standard e-reader.
    * Left and right buttons control page navigation as well as visible buttons on the left and right of the screen.

### 2.4 Typing Engine & Analytics
* **Live Overlay:** Minimal, toggleable HUD showing current WPM, Accuracy (%), session time, and chapter navigation buttons.
* **Analytics Handling:**
    * Skipped words (via `Enter`) are omitted from WPM and Accuracy calculations.
    * **Session End:** A session ends automatically after **30 seconds of inactivity** or when the user exits.
    * **Inactivity Cleanup:** If a session ends due to inactivity, the last 30 seconds of typing data are discarded to ensure accurate performance metrics.
* **Settings & Profile Tab:**
    * Aggregate metrics over time (Line charts for WPM progression, Accuracy trends).
    * Global statistics (Total words typed, total time spent).
    * All analytics exclude words skipped via `Enter`.
    * **Themes:** Catppuccin Macchiato, Gruvbox Dark, Sepia, Solarized Light.
*   **Focus Mode:** HUD fades out during active typing, reappearing on pause or mouse movement.
*   **Progress Tracking:** Minimalist progress bar at the bottom/top showing book completion % with another smaller bar under it showing chapter/chunk completion.


## 3. Open Questions & Next Steps
1.  **Content Virtualization:** Implement a windowing system to handle long-form text within a chapter if it exceeds performance thresholds.
2.  **Rust Command Interface:** Define the Tauri commands for streaming text chapters and metadata from the backend.