**typeread** is a premium, distraction-free desktop application designed for bibliophiles and typing enthusiasts. It transforms your reading list into an immersive typing experience, allowing you to master your keyboard while journeying through your favorite literature.

## ✨ Features

- **📚 Universal Library**: Seamlessly import EPUB, Markdown, and TXT files. Your entire library is stored locally, with granular progress tracking for every book.
- **⌨️ Immersive Type Mode**: A focused, high-performance typing engine with real-time feedback.
  - **Loose Typing with Anchors**: Errors are highlighted but won't halt your flow.
  - **Smart Normalization**: Automatically handles curly quotes and em-dashes for a smooth experience.
  - **Focus HUD**: Minimalist metrics (WPM, Accuracy, Progress) that fade out during active typing to keep you in the zone.
- **📖 Elegant Read Mode**: Switch to a classic e-reader interface when you just want to get lost in the story.
- **🎨 Skueomorphic Layouts**: Choose between a modern **Infinite Scroll** or a classic **2-Page Spread** with smooth animations.
- **📊 Advanced Analytics**: Detailed insights into your typing performance over time, featuring WPM trends, accuracy charts, and session history.
- **🏆 Achievements & Versus Mode**: Stay motivated with a built-in achievement system and challenge yourself in Versus mode against your past performance or ghost competitors.
- **🌓 Custom Themes & Typography**: Fully customizable interface with curated themes (Catppuccin, Gruvbox, Sepia, etc.) and professional-grade fonts optimized for both reading and coding.

## 🛠️ Tech Stack

- **Core**: [Tauri](https://tauri.app/) (Rust Backend + Vite/React Frontend)
- **Frontend**: React, TypeScript, TailwindCSS, Zustand, Framer Motion
- **Backend**: Rust (pulldown-cmark, epub, scraper)
- **Database**: SQLite (Local persistence)
- **Styling**: Vanilla CSS + TailwindCSS Design System

## 🚀 Download & Installation

### macOS (Recommended)

```bash
brew tap tianyi1580/tap
brew install --cask typeread
```

### Manual Download
You can download the latest installers for macOS and Windows from the [Releases](https://github.com/tianyi1580/typeread/releases) page.

> [!IMPORTANT]
> **macOS Security Note:** If you download the `.dmg` manually and see a message saying the app is "damaged" or "cannot be opened," this is a macOS security feature for unsigned apps. To fix it, run this command in your Terminal:
> `xattr -cr /Applications/TypeRead.app`

---

## 🛠️ Development Setup

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) or `npm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tianyi1580/typeread.git
   cd typeread
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

### Building for Production

To create a native installer for your platform:
```bash
npm run tauri build
```

## 🏗️ Architecture

- **`src-tauri/`**: Rust source code. Handles file parsing (EPUB/MD), database management, and high-performance analytics.
- **`src/`**: React application. A highly responsive UI built with Zustand for lightning-fast state updates during typing.
- **`src/components/TypingLayer.tsx`**: The core typing engine that tracks every keystroke with sub-millisecond latency.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*type type type*
