# Pet System Implementation Plan: Kaylie (High-Performance Rive Path)

This plan prioritizes **Application Performance (#1)** while delivering a **Premium & Alive** feel for our first companion: **Kaylie**, the white cat.

## 1. System Architecture

### 1.1 State Management (`src/store/pet-store.ts`) [DONE]
A new Zustand store managed as a tab in the shop/profile to handle:
- `activePetId`: string | null
- `unlockedPetIds`: string[]
- `petStats`: Record<string, { happiness: number, experience: number }>

### 1.2 Data Models (`src/types.ts`) [DONE]
Added `PetDefinition` for metadata and rarity.

## 2. Component Design (High Fidelity)

### 2.1 `TypeBuddy` Component (`src/components/ui/TypeBuddy.tsx`)
A dedicated container using **Rive** for high-performance interactive animations.
- **Positioning**: Fixed in the margins (bottom-right) of the Reader and Practice views.
- **Visuals**: A "Glass-Morph" pedestal with a Rive runtime canvas.
- **Interactions**: State Machine inputs drive behavior (Mouse hover, Typing speed).

### 2.2 `Kaylie` Implementation (Rive)
Kaylie will be implemented as a Rive State Machine to ensure organic, fluid movement with zero CPU overhead for logic.
- **States**: 
  - `Idle`: Soft breathing, looking around, occasional blink.
  - `Typing`: Concentrated look, head tracking the "caret" via Rive inputs.
  - `Fast`: High-energy tail wag, "zoomie" eyes, glowing aura.
  - `Error`: Subtle "paws-over-eyes" or disappointment posture.

## 3. Integration Plan

### Phase 1: Foundation (Current)
1.  **Dependencies**: Install `@rive-app/react-canvas`.
2.  **Infrastructure**: Update `TypeBuddy.tsx` to handle Rive runtimes.
3.  **Mock Assets**: Use a high-quality placeholder `.riv` while Kaylie's specific asset is finalized.

### Phase 2: "Alive" Interactivity
1.  **State Machine Inputs**: Map `wpm`, `accuracy`, and `isTyping` to Rive inputs (`Number` and `Boolean`).
2.  **Cursor Tracking**: Pass mouse coordinates to Rive for real-time head tracking.

### Phase 3: Premium Polish
1.  **Aura System**: Use CSS filters (drop-shadow/glow) on the Rive canvas that change color based on `theme.accent`.
2.  **Theme Adaptation**: Detect "Rainy Window" theme to trigger "paws-on-glass" or "umbrella" states in Rive.

## 4. Next Steps
1.  [ ] Install `@rive-app/react-canvas`.
2.  [ ] Update `TypeBuddy.tsx` to use `useRive` hook.
3.  [ ] Implement Rive input mapping for metrics.
