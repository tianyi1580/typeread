# TypeRead

**TypeRead** is a high-performance, distraction-free desktop application engineered for bibliophiles and typing enthusiasts. It seamlessly bridges the gap between digital literature and typing proficiency, enabling users to read their favorite books while practicing high-speed, accurate keyboarding.

---

## 🏗️ Architecture Stack

TypeRead is designed as a lightweight, secure local-first application using a modern polyglot stack.

- **Core & Security**: [Tauri v2](https://tauri.app/) (Rust-based engine providing isolated system APIs)
- **Frontend Surface**: React 18, TypeScript 5, Vite
- **High-Speed State Management**: [Zustand](https://zustand.docs.pmnd.rs/) (Optimized for sub-millisecond keystroke event transport)
- **Local Data Layer**: SQLite via `rusqlite` (Local persistence for books, configurations, and metrics)
- **Styling Engine**: TailwindCSS combined with micro-animations powered by [Framer Motion](https://www.framer.com/motion/)

---

## ✨ Features

- **📚 Universal Library Support**: Native parsing of `.epub`, `.md`, and `.txt` files with dynamic sanitization.
- **⌨️ Advanced Typing Engine**:
  - **Loose Typing with Anchor Resets**: Typing errors shift character highlights but never halt user input.
  - **Intelligent Normalization**: Automatically maps smart punctuation (`“`, `”`, `—`) to straight ASCII equivalents.
  - **Spacebar Snapping**: Quickly realigns out-of-sync cursor positions safely.
- **📖 Adaptive Reading Views**: High-fidelity **2-Page Spread** layout with CSS transforms or standard **Infinite Scroll** interfaces.
- **📊 Granular Analytics Pipelines**: Full tracking of raw/net WPM, error rates, speed heatmaps, and historical records.
- **🏆 Progression & Versus Mode**: Gamified achievement systems paired with simulated typing opponents.

---

## 📂 Project Structure

```
typeread/
├── src-tauri/                 # Backend Rust Execution Layer
│   ├── src/
│   │   ├── main.rs            # Application bootstrap & Tauri bindings
│   │   ├── db.rs              # SQLite lifecycle & transaction routing
│   │   ├── parser.rs          # Book format conversion pipeline
│   │   └── analytics.rs       # Performance statistical processing
├── src/                       # Frontend Presentation Layer
│   ├── components/            # UI, Views (Analytics, Library, Settings)
│   ├── hooks/                 # Event bindings and hardware listeners
│   ├── lib/                   # Achievement configurations and layouts
│   ├── store/                 # Zustand persistent application state
│   └── utils/                 # Algorithmic pagination and typing matrices
```

---

## 🛠️ Local Development

Ensure you have [Rust (1.75+)](https://www.rust-lang.org/), [Node.js (v18+)](https://nodejs.org/), and `npm` ready.

1. **Clone Repo**:
   ```bash
   git clone https://github.com/tianyi1580/typeread.git
   cd typeread
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Execute Tauri Dev Server**:
   ```bash
   npm run tauri dev
   ```

To bundle an optimized, native platform binary:
```bash
npm run tauri build
```
---

## 🔖 Versioning

To release a new version of TypeRead, run the standard npm version command:
```bash
npm version <patch|minor|major>
git push origin main --follow-tags

```
This will automatically execute the `sync_version.cjs` hook, propagating the version bump from `package.json` into Tauri's underlying configuration files (`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.lock`) securely before creating the Git commit and tag.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*type type type*
