# Parallelizable Codebase Review Plan

This plan breaks down the TypeRead codebase into distinct, non-overlapping sections for review.

## Section 1: Backend Core & Database
Overview: The Rust-based backend initialization and data persistence layer.
Context (files to look at):
- [src-tauri/src/main.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/main.rs)
- [src-tauri/src/db.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/db.rs)
- [src-tauri/src/models.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/models.rs)
Intended function of these files: Sets up the Tauri application context, manages the SQLite database lifecycle (migrations, connections), and defines the Rust structs mapping to database tables.

## Section 2: Backend Parser & Analytics
Overview: Book ingestion and statistical analysis engine.
Context (files to look at):
- [src-tauri/src/parser.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/parser.rs)
- [src-tauri/src/analytics.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/analytics.rs)
- [src-tauri/src/welcome.rs](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/src/welcome.rs)
Intended function of these files: Handles parsing logic for EPUB and TXT files, processes typing speed/accuracy metrics for persistence, and manages default data for new users.

## Section 3: Frontend State & Theming
Overview: Global application state and styling definitions.
Context (files to look at):
- [src/store/app-store.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/store/app-store.ts)
- [src/theme.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/theme.ts)
- [src/types.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/types.ts)
- [src/lib/tauri.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/tauri.ts)
Intended function of these files: Manages React state via Zustand, defines the application's color palettes, provides TypeScript interfaces, and wraps Tauri's `invoke` calls for frontend safety.

## Section 4: Frontend Typing & Pagination Logic
Overview: Core algorithms driving the typing experience.
Context (files to look at):
- [src/utils/typing.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/utils/typing.ts)
- [src/utils/pagination.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/utils/pagination.ts)
- [src/hooks/useBufferedKeystrokeTransport.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/hooks/useBufferedKeystrokeTransport.ts)
Intended function of these files: Implements character-by-character validation, WPM calculation, text segmenting for reading, and performance-optimized keyboard event listeners.

## Section 5: Frontend Data Libraries
Overview: Static assets and application constants.
Context (files to look at):
- [src/lib/achievements.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/achievements.ts)
- [src/lib/demo.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/demo.ts)
- [src/lib/keyboard-layouts.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/keyboard-layouts.ts)
- [src/lib/progression.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/progression.ts)
- [src/lib/utils.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/utils.ts)
- [src/lib/word-bank.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/lib/word-bank.ts)
Intended function of these files: Provides read-only data for achievements, default content, keyboard layout maps, leveling math, and word pools.

## Section 6: Frontend Views - Library & Settings
Overview: User interfaces for content management and customization.
Context (files to look at):
- [src/components/LibraryView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/LibraryView.tsx)
- [src/components/SettingsView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/SettingsView.tsx)
- [src/components/ui/color-picker.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/ui/color-picker.tsx)
Intended function of these files: Renders the book library shelf and the configuration screens for user preferences.

## Section 7: Frontend Views - Reader & Core Typing
Overview: The primary user interaction surface.
Context (files to look at):
- [src/components/ReaderView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/ReaderView.tsx)
- [src/components/TypingLayer.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/TypingLayer.tsx)
- [src/components/Hud.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/Hud.tsx)
Intended function of these files: Displays the book text, captures typing input visually, and updates the real-time stats overlay.

## Section 8: Frontend Views - Practice & Multiplayer
Overview: Alternative interactive modes.
Context (files to look at):
- [src/components/PracticeView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/PracticeView.tsx)
- [src/components/VersusConfigModal.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/VersusConfigModal.tsx)
Intended function of these files: Manages isolated typing drills and competitive mode setups.

## Section 9: Frontend Views - Analytics & Achievements
Overview: Post-session feedback and progress tracking.
Context (files to look at):
- [src/components/AnalyticsView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/AnalyticsView.tsx)
- [src/components/AchievementsView.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/AchievementsView.tsx)
- [src/components/SessionSummaryModal.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/SessionSummaryModal.tsx)
Intended function of these files: Renders graphs, achievement badges, and the summary popup after a chapter is finished.

## Section 10: App Shell & UI Kit
Overview: Application framework and atomic components.
Context (files to look at):
- [src/App.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/App.tsx)
- [src/main.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/main.tsx)
- [src/index.css](file:///Users/tianyima/Downloads/Projects/typeread/src/index.css)
- [src/components/ui/button.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/ui/button.tsx)
- [src/components/ui/card.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/ui/card.tsx)
- [src/components/ui/InfoTooltip.tsx](file:///Users/tianyima/Downloads/Projects/typeread/src/components/ui/InfoTooltip.tsx)
- [index.html](file:///Users/tianyima/Downloads/Projects/typeread/index.html)
Intended function of these files: Bootstraps the React application, applies global styles, and defines shared design primitives.

## Section 11: Build & Project Configuration
Overview: Tooling, dependencies, and deployment settings.
Context (files to look at):
- [package.json](file:///Users/tianyima/Downloads/Projects/typeread/package.json)
- [tauri.conf.json](file:///Users/tianyima/Downloads/Projects/typeread/tauri.conf.json)
- [vite.config.ts](file:///Users/tianyima/Downloads/Projects/typeread/vite.config.ts)
- [tsconfig.json](file:///Users/tianyima/Downloads/Projects/typeread/tsconfig.json)
- [tsconfig.node.json](file:///Users/tianyima/Downloads/Projects/typeread/tsconfig.node.json)
- [Cargo.toml](file:///Users/tianyima/Downloads/Projects/typeread/Cargo.toml)
- [build.rs](file:///Users/tianyima/Downloads/Projects/typeread/build.rs)
- [.gitignore](file:///Users/tianyima/Downloads/Projects/typeread/.gitignore)
- [postcss.config.js](file:///Users/tianyima/Downloads/Projects/typeread/postcss.config.js)
- [tailwind.config.ts](file:///Users/tianyima/Downloads/Projects/typeread/tailwind.config.ts)
- [src-tauri/capabilities/default.json](file:///Users/tianyima/Downloads/Projects/typeread/src-tauri/capabilities/default.json)
- [scripts/generate_cask.cjs](file:///Users/tianyima/Downloads/Projects/typeread/scripts/generate_cask.cjs)
- [.github/workflows/release.yml](file:///Users/tianyima/Downloads/Projects/typeread/.github/workflows/release.yml)
- [src/vite-env.d.ts](file:///Users/tianyima/Downloads/Projects/typeread/src/vite-env.d.ts)
Intended function of these files: Defines build pipelines, external dependencies, and environment configurations for both frontend and backend.
