Core logistics:

Chapter separation: When parsing the input files, the chapter serparation / chunking is not working properly. For example, with sky raiders book 1 (1).epub, there are about 35 chapters, but the app thinks there are only 4 chapters. Each chapter in it is denoted by "Chapter X" in the text of the book. This should be used as ground trutch when there are no explicit chapter markers in the file structure. If there are actually no chapters, split the file into chunks of ~ 2000 each. The splits should be at sentence endings to avoid cutting off words/ sentences.

Resuming: When resuming the book, the app should start from where the user left off, including cursor position. This means if I left off in the middle of a word, the app should still start from that word, with the cursor at the correct position. If I left off at the end of a word, the app should start from the next word, with the cursor at the beginning of that word. Currently, there is no resume feature, so the app always starts from the beginning of the book.

Analytics: The graphs don't have numbers on the axes making it hard to tell what the exact wpm and accuracy is at any point. Implement proper axes with numbers. I also want the graphs to be interactive. When the user hovers over a point in the graph, it should show the exact data at that point. 

Font Settings: Remove "read" fonts entirely. Only use fonts in the "type" category. The fonts in font settings should show a preview of what the font looks like when typing. 

Ignore quotation marks toggle: Replace this toggle with a text box that allows the user to input any characters they want to ignore when typing in the format "character1", "character2", "character3", etc. The cursor will simply skip over the inputted characters when typing, not count them as correct or incorrect using the same logic as the current ignore quotation marks toggle. 

Start from anywhere: Currently, the user can only start typing from the beginning of the book. I want to be able to click anywhere in the book and start typing from that word.

Word deletion: Implement word deletion when hitting ctrl + backspace. 

Keyboard layout: Implement a keyboard layout selection system where the user can select or customize their keyboard layout, and the app will use that layout to compute deep analytics eg. directional drift.

Deep analytics:

### 1. The Architecture: Buffered Event Syncing
To prevent UI freezes without sacrificing data granularity, we do not send individual keystrokes across the Tauri bridge, nor do we wait until the end of a session to send a massive event array.

* **The Mechanic:** Use a React Ref (or non-reactive part of Zustand) to store a local array of keystrokes to prevent re-renders on every strike. Every 100 events, it fires an asynchronous IPC call (`invoke('process_keystroke_batch')`) to Rust and clears the local buffer.
* **The Final Flush:** Triggered on session end, chapter completion, or component unmount. Add a listener for `beforeunload` or Tauri's `on_window_event` to catch hard exits.
* **The Benefit:** Background processing on Apple Silicon ensures analytics are ready the instant a session ends without impacting typing latency.

### 2. The Raw Data Stream (Zustand)
The engine runs on a high-fidelity event log. To solve the "Alignment Problem" (insertions/deletions shifting indices), the frontend captures the **Intent** (target char at cursor) at the moment of the strike:
* `at`: Unix timestamp in milliseconds.
* `char`: The exact character typed.
* `expected`: The character required by the engine at that specific cursor position.
* `type`: `char`, `space`, `backspace`, or `meta` (for Ctrl+Backspace/Delete).
* `isCorrect`: Boolean flag.
* `layout`: The user's active keyboard layout (needed for drift diagnosis).

### 3. The Four Pillars of Deep Analytics (Rust)

#### A. Fluid Rolling WPM (Weighted Sliding Window)
Rust calculates a continuous degradation curve rather than fixed buckets.
* **The Logic:** Instead of tracking whole words, Rust maintains a queue of `(timestamp, weight)` where weight is `1/5` (standard WPM definition). 
* **Performance:** Use Ramer-Douglas-Peucker (RDP) downsampling in Rust to reduce 10,000+ points to a dual-view: a **Macro View** (500 points) for the full session and a **High-Fidelity Window** for the last 30 seconds.

#### B. Cadence and Consistency (Coefficient of Variation)
Measures typing rhythm. A metronomic typist scores high; an erratic typist scores low.
* **The Outlier Filter:** Use **Median Absolute Deviation (MAD)** to detect and ignore "non-typing pauses" (e.g., turning a page, checking a notification) instead of a fixed 2s ceiling.
* **Mathematical Score:** Instead of raw standard deviation, we use the **Coefficient of Variation** ($CV = \sigma / \mu$). A lower $CV$ translates to a 0-100% "Rhythm Score" that is comparable across different speed levels.
* **Focus Score:** Active Typing Time / Total Session Time.

#### C. Diagnostic Confusion Matrix (Directional Drift)
* **The Logic:** Rust maintains a `HashMap<(expected_char, typed_char), count>`.
* **Layout Awareness:** By knowing the layout (e.g., QWERTY), Rust detects "Directional Drift." If a user consistently hits 'S' for 'A', the analytics diagnose a mechanical left-hand shift, not just a "mistake."

#### D. Transition Heatmaps (Muscle Memory)
Tracks travel time between specific key pairs.
* **The Logic:** Logs transition time for correct bigrams/trigrams. Rust uses Welford's Online Algorithm to maintain running mean and variance per combination.
* **The Output:** Rust returns the **Top 50** most relevant bigrams (Fastest, Slowest, and Highest Error Rate) to populate the "Drill List."

### 4. The UI Delivery (Profile Tab)
1.  **The Hero Graph:** A downsampled, interactive WPM progression line with numbered axes and hover tooltips.
2.  **The Keyboard Heatmap:** A visual SVG keyboard. Clicking a key displays **Directional Vectors** (arrows) showing which keys the user's fingers drift toward based on the Confusion Matrix.
3.  **The Transition Tables:** Side-by-side lists of "Muscle Memory" vs "Drill List" (slowest/highest error combos).
4.  **Persistence:** Summarized analytics (Confusion Matrix JSON, Bigram Stats) are saved to SQLite. Raw event logs are discarded after processing to keep the DB lean.

New features:

Classic monkeytype like game mode: In the menu dropdown, add a new page called type test. This should be the exact same as monkeytype's type test mode with options for 15, 30, 60, 120 second.

Type vs. bot: In the menu dropdown, add a popout page called versus mode. This is a dueling mode where you race against a bot that types at a preset cpm that the user can adjust. This takes place in the same interface as the normal typing mode, but there is a small dot with a trail behind it moving across the bottom of the words indicating the bot's progress. The bot should start wherever the user is currently typing and if the bot gets too far ahead (30 words ahead) then it stops to take a break until the user catches up to within 10 words.

Achievements: Create an achievements page in the menu dropdown that displays all of the achievements the user can earn. I want the achievements to be similar to the ones on monkeytype. Make some general achievements like 30 wpm, 50 wpm, 70 wpm, 100 wpm, 130 wpm, 160 wpm, 200 wpm (average across a session), 1 minute session, 2 minute session, 5 minute session, 10 minute session, 15 minute session, 20 minute session, 30 minute session, 45 minute session, 60 minute session, 100 words typed, 500 words typed, 1000 words typed, 5000 words typed, 10000 words typed, 50000 words typed, 100000 words typed, 100 percent accuracy, etc. Make a separate page for achievements, each achievement should be in a card with the name of the achievement, a description of how to get it, and the date it was earned. 

Leveling System:

### 1. The Core Philosophy
* **Zero Intrusions:** You never, ever interrupt an active reading session with a "Level Up!" popup. 
* **The "Session End" Dopamine Hit:** The XP bar and unlock notifications only appear when the user hits `Esc` or clicks "End Session", turning the post-reading screen into a highly rewarding summary.
* **Skill over Grind:** Base XP comes from time and volume, but the real progression speed comes from accuracy and consistency multipliers.

### 2. The XP Math (The Engine)
Instead of arbitrary numbers, map the XP directly to the data Rust is already processing. 

**Base XP:**
* **1 Word Typed = 1 XP.** (This keeps the math grounded. If a user types a 100,000-word book, they know they generated exactly 100,000 base XP).

**The Multipliers (Calculated per session):**
* **The Accuracy Multiplier:** Punish sloppy speed; reward precision.
    * < 94% Accuracy = $1.0\times$
    * 95% - 97% = $1.2\times$
    * 98% - 99% = $1.5\times$
    * 100% (Flawless Session) = $2.0\times$
* **The Cadence Multiplier:** Using the Welford's Algorithm score we built. If their Cadence Score is in the top 90th percentile (metronomic rhythm), apply a $1.15\times$ multiplier. 
* **The Endurance Bonus:** For every 15 continuous minutes spent typing without a pause longer than 60 seconds, add a stacking $+0.05\times$ multiplier. This prevents users from doing 2-minute sprints and forces them to build long-form stamina.

**The Daily Log-In (The "Rested XP" Mechanic):**
Do not give flat XP just for opening the app. Borrow the "Rested" mechanic from MMOs. 
* Logging in adds a "Rested Buffer" equivalent to 500 words. 
* For the first 500 words typed that day, all XP generation is doubled. If they maintain a daily streak, the Rested Buffer increases (e.g., Day 5 streak = 2,500 words of Rested XP). This forces engagement with the core loop.

**Total Session XP Formula:**
$$Total\_XP = (Words \times Accuracy\_Mult \times Cadence\_Mult \times Endurance\_Mult) + Rested\_Bonus$$

### 3. The Leveling Curve
You need a curve that feels fast initially to hook the user, but flattens into a long-term grind for dedicated users.
A standard polynomial curve works perfectly here. Let $L$ be the target level:
$$Required\_XP = 1000 \times L^{1.5}$$

* Level 2 requires ~2,800 total XP (about a 30-minute session).
* Level 10 requires ~31,600 total XP (a few days of reading).
* Level 50 requires ~353,000 total XP (completing 3-4 full novels).

### 4. Unlocks and Progression Tiers
The rewards must tie directly into the aesthetic and customization of the app.

**Titles (Display strictly in the Profile Tab):**
Group levels into brackets. When a user hits a new bracket, the metallic/color trim around their Profile Avatar changes.
* Levels 1-9: *Initiate* (Bronze)
* Levels 10-24: *Scribe* (Silver)
* Levels 25-49: *Archivist* (Gold)
* Levels 50-99: *Lexicon* (Amethyst)
* Level 100+: *Grandmaster* (Obsidian/Crimson)

**Cosmetic Unlocks (The Carrot on the Stick):**
Tie specific UI settings to level milestones so the user has a reason to grind.
* **Level 5:** Unlocks the *Dracula* and *Nord* dark themes.
* **Level 10:** Unlocks "Smooth Caret" mode (the `|` cursor smoothly glides between characters instead of jumping rigidly).
* **Level 15:** Unlocks premium typography (e.g., Fira Code with stylistic ligatures).
* **Level 25:** Unlocks "Ghost Pacer" (the ability to race your previous best WPM in real-time).
* **Level 50:** Unlocks custom error-highlight colors (hex code input instead of default red).

### 5. UI Integration
How to keep it out of the way:
* **The Minimalist Indicator:** In the Core Reader view, the only indication of level is a 1-pixel high, ultra-faint progress bar pinned to the absolute top edge of the window. It slowly fills across the screen as they type. 
* **The Post-Session Screen:** When they hit `Esc`, the UI transitions to the session summary. *This* is where the math explodes. 
    * The screen tallies their Words.
    * The UI rapidly applies the Accuracy, Cadence, and Endurance multipliers, showing the final XP number count up quickly.
    * The XP is dumped into their level bar. If it rolls over, play a subtle, satisfying chime, and slide a toast notification on screen: `"Level 15 Reached: Fira Code Unlocked."`
    * Use Glassmorphism for all of the UI elements.