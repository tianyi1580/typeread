# Codebase Review Plan

This document outlines the strategy for a comprehensive review of the `typeread` codebase. The objective is to identify and resolve inefficiencies, logical errors, design flaws, and suboptimal coding practices across all layers.

## Review Sections (Parallelizable)

### 1. Data Persistence & Backend Infrastructure (Rust)
- **Overview**: Review the core backend architecture and database interaction layer.
- **Context (files)**: 
  - `src-tauri/src/db.rs`
  - `src-tauri/src/models.rs`
  - `src-tauri/src/main.rs`
- **Intended Function**: Manages the SQLite database (schema, migrations, CRUD), defines data models, and sets up the Tauri command handlers.

### 2. Content Processing & Analytical Logic (Rust)
- **Overview**: Audit the complexity and correctness of book parsing and server-side metric calculations.
- **Context (files)**: 
  - `src-tauri/src/parser.rs`
  - `src-tauri/src/analytics.rs`
- **Intended Function**: Parses EPUB files into structured chapters/text and performs heavy-duty calculations for typing speed, accuracy, and session trends.

### 3. Global State & Type Definitions (Frontend)
- **Overview**: Inspect the single source of truth for the frontend and its type safety.
- **Context (files)**: 
  - `src/store/app-store.ts`
  - `src/types.ts`
  - `src/theme.ts`
- **Intended Function**: Manages application-wide state using Zustand, defines global TypeScript interfaces, and stores design tokens/theme configurations.

### 4. Core Logic, Bridge & Shared Hooks
- **Overview**: Review the non-UI business logic and the communication layer between JS and Rust.
- **Context (files)**: 
  - `src/lib/` (e.g., `tauri.ts`, `progression.ts`, `achievements.ts`)
  - `src/hooks/` (e.g., `useBufferedKeystrokeTransport.ts`)
  - `src/utils/` (e.g., `typing.ts`, `pagination.ts`)
- **Intended Function**: Provides custom React hooks for specialized behavior, general utility functions, and the `tauri.ts` wrapper for backend calls.

### 5. Application Entry & Navigation Flow
- **Overview**: Evaluate the mounting process and top-level view switching.
- **Context (files)**: 
  - `src/App.tsx`
  - `src/main.tsx`
- **Intended Function**: Handles the main application lifecycle, initializes the store, and manages the conditional rendering of primary views (Library, Reader, Analytics, etc.).

### 6. Typing Engine & Reader Interface
- **Overview**: Focus on the most performance-critical part of the app: the live typing experience.
- **Context (files)**: 
  - `src/components/ReaderView.tsx`
  - `src/components/TypingLayer.tsx`
  - `src/components/Hud.tsx`
- **Intended Function**: Displays book content, tracks real-time keystrokes, manages the typing caret, and renders the "Heads-Up Display" for live feedback.

### 7. Library Management & Import Flow
- **Overview**: Review how books are listed, searched, and added to the database.
- **Context (files)**: 
  - `src/components/LibraryView.tsx`
- **Intended Function**: Provides the interface for browsing the user's book collection and initiating the EPUB import process.

### 8. Analytics Visualizations & Session Feedback
- **Overview**: Audit the data visualization and session summary components.
- **Context (files)**: 
  - `src/components/AnalyticsView.tsx`
  - `src/components/SessionSummaryModal.tsx`
  - `src/components/AchievementsView.tsx`
- **Intended Function**: Renders charts (e.g., Recharts), historical session data, and achievement milestones after typing sessions.

### 9. User Preferences & Practice Modes
- **Overview**: Review the settings and auxiliary typing modes.
- **Context (files)**: 
  - `src/components/SettingsView.tsx`
  - `src/components/PracticeView.tsx`
  - `src/components/VersusConfigModal.tsx`
- **Intended Function**: Allows users to customize the UI/typing experience and participate in non-book-related typing exercises.

### 10. Design System & Global Styles
- **Overview**: Check the atomicity and consistency of the UI components and CSS.
- **Context (files)**: 
  - `src/components/ui/` (Shared components)
  - `src/index.css`
  - `tailwind.config.ts`
- **Intended Function**: Defines the look and feel through reusable UI elements and global Tailwind/CSS rules.
