import React, { useEffect, useMemo, useRef, useCallback, useState, useLayoutEffect, useImperativeHandle, memo, forwardRef } from "react";
import { cn } from "../lib/utils";
import type { InteractionMode, TokenizedWord, TypingSnapshot, WordTypingState } from "../types";
import { normalizeForCompare } from "../utils/typing";
import { useAppStore } from "../store/app-store";

function getScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let container: HTMLElement | null = el?.parentElement || null;
  while (container && container !== document.body) {
    const style = window.getComputedStyle(container);
    if (/(auto|scroll)/.test(style.overflowY)) {
      return container;
    }
    container = container.parentElement;
  }
  return document.body;
}

/**
 * Properties for the TypingLayer component.
 */
interface TypingLayerProps {
  /** List of tokenized words to display. */
  tokens: TokenizedWord[];
  /** Current typing state snapshot. */
  snapshot: TypingSnapshot;
  /** Full text of the chapter. */
  chapterText: string;
  /** Optional visible character range for pagination. */
  visibleRange?: { start: number; end: number };
  /** Disable automatic scrolling. */
  noScroll?: boolean;
  /** Additional CSS classes. */
  className?: string;
  /** Enable fading effect for distant words. */
  faded?: boolean;
  /** Comparison options for character matching. */
  compareOptions?: {
    ignoredCharacters?: ReadonlySet<string>;
  };
  /** Callback when a word is clicked. */
  onWordClick?: (wordIndex: number) => void;
  /** Current interaction mode. */
  interactionMode?: InteractionMode;
  /** Enable smooth caret animations. */
  smoothCaret?: boolean;
  /** Index of the bot's cursor in versus mode. */
  botCursorIndex?: number | null;
}


export function TypingLayer({
  tokens,
  snapshot,
  chapterText,
  visibleRange,
  noScroll,
  className,
  faded = true,
  compareOptions,
  onWordClick,
  interactionMode = "type",
  smoothCaret = false,
  botCursorIndex = null,
}: TypingLayerProps) {
  const { settings } = useAppStore();
  const isPremiumTheme = settings.theme === "nebula-drift" || settings.theme === "rainy-window" || settings.theme === "satin-heart";
  const effectiveSmoothCaret = smoothCaret || isPremiumTheme;

  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const WINDOW_SIZE = 300;
  const BUFFER = 80;
  const [windowStart, setWindowStart] = useState(() => {
    if (visibleRange || noScroll) return 0;
    const current = snapshot.currentWordIndex;
    return Math.max(0, current - Math.floor(WINDOW_SIZE / 2));
  });
  const preShiftRelativeTop = useRef<number | null>(null);
  const lastOffsetTop = useRef<number | null>(null);
  const lastWordIndex = useRef<number>(-1);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const animationFrameId = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const isJumpingRef = useRef(false);
  const isStretchingRef = useRef(false);
  const caretPosRef = useRef({ top: 0, left: 0, height: 0, opacity: 0 });

  // We use this to detect manual jumps (index change > 1) to disable sliding animations.
  const prevIdxRef = useRef(snapshot.currentWordIndex);

  // Buffered windowing to prevent shifting the DOM on every single word.
  useLayoutEffect(() => {
    if (visibleRange || noScroll || interactionMode === "read") return;
    const current = snapshot.currentWordIndex;
    if (current < windowStart + BUFFER || current > windowStart + WINDOW_SIZE - BUFFER) {
      const newStart = Math.max(0, current - Math.floor(WINDOW_SIZE / 2));
      if (Math.abs(newStart - windowStart) > 15) {
        // Capture position before shift for anchoring
        if (currentWordRef.current) {
          preShiftRelativeTop.current = currentWordRef.current.getBoundingClientRect().top;
        }
        setWindowStart(newStart);
      }
    }
  }, [snapshot.currentWordIndex, windowStart, visibleRange, noScroll, interactionMode]);

  // Premium Spring Physics State
  const springRef = useRef({
    current: 0,
    target: 0,
    velocity: 0,
    lastTime: 0,
    isActive: false,
  });

  // Scroll anchoring: compensate for DOM shifts caused by window changes instantly.
  useLayoutEffect(() => {
    if (preShiftRelativeTop.current !== null && currentWordRef.current) {
      const el = currentWordRef.current;
      const container = getScrollContainer(el);

      if (container) {
        const newTop = el.getBoundingClientRect().top;
        const delta = newTop - preShiftRelativeTop.current;
        if (Math.abs(delta) > 0.5) {
          const isWindowScroll = container === document.body;
          const nextScroll = Math.max(0, (isWindowScroll ? window.scrollY : container.scrollTop) + delta);

          if (isWindowScroll) window.scrollTo(0, nextScroll);
          else container.scrollTop = nextScroll;

          // Keep spring state in sync with anchoring jumps
          springRef.current.current += delta;
          springRef.current.target += delta;
        }
      }
      preShiftRelativeTop.current = null;
    }
  }, [windowStart]);

  const visibleTokens = useMemo(() => {
    if (visibleRange) {
      // Spread mode re-renders on every keystroke; avoid rescanning the full chapter
      // when the visible page range is already sorted by token start offsets.
      const startIndex = lowerBoundTokenStart(tokens, visibleRange.start);
      const endIndex = lowerBoundTokenStart(tokens, visibleRange.end);
      return tokens
        .slice(startIndex, endIndex)
        .map((token, index) => ({ token, index: startIndex + index }));
    }

    if (interactionMode === "read") {
      return tokens.map((token, index) => ({ token, index }));
    }

    const start = windowStart;
    const end = Math.min(tokens.length, start + WINDOW_SIZE);

    return tokens
      .slice(start, end)
      .map((token, index) => ({ token, index: start + index }));
  }, [tokens, visibleRange, windowStart, interactionMode]);

  // Immediate jump for initial mount or manual jumps to prevent sliding from top
  useLayoutEffect(() => {
    const el = currentWordRef.current;
    if (noScroll || visibleRange || !el) return;

    const currentIndex = snapshot.currentWordIndex;
    const isManualJump = lastWordIndex.current === -1 || Math.abs(currentIndex - lastWordIndex.current) > 1;

    if (isManualJump) {
      const container = getScrollContainer(el);
      if (!container) return;

      const isWindowScroll = container === document.body;
      const containerRect = isWindowScroll
        ? { top: 0, height: window.innerHeight }
        : container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      const currentRelativeCenter = (elRect.top + elRect.height / 2) - (containerRect.top + containerRect.height / 2);
      const currentScroll = isWindowScroll ? window.scrollY : container.scrollTop;
      const target = Math.max(0, currentScroll + currentRelativeCenter);

      if (isWindowScroll) window.scrollTo(0, target);
      else container.scrollTop = target;

      springRef.current.target = target;
      springRef.current.current = target;
      springRef.current.velocity = 0;
      springRef.current.isActive = false;

      lastWordIndex.current = currentIndex;
      lastOffsetTop.current = el.offsetTop;
    }
  }, [snapshot.currentWordIndex, windowStart, noScroll, visibleRange]);

  // Smooth spring-based scroll logic for line changes
  useEffect(() => {
    const el = currentWordRef.current;
    if (noScroll || visibleRange || !el || interactionMode === "read") return;

    const currentIndex = snapshot.currentWordIndex;
    const isManualJump = lastWordIndex.current === -1 || Math.abs(currentIndex - lastWordIndex.current) > 1;

    // We handle manual jumps in useLayoutEffect for immediate positioning.
    // Here we only care about line changes during normal typing.
    if (isManualJump) return;

    // Find the nearest scrollable ancestor
    const container = getScrollContainer(el);
    if (!container) return;

    const isWindowScroll = container === document.body;
    const containerRect = isWindowScroll
      ? { top: 0, height: window.innerHeight }
      : container.getBoundingClientRect();

    // Use caret position for precise centering if available, fallback to current word
    const typingLayerRect = containerRef.current?.getBoundingClientRect();
    const currentCaret = caretPosRef.current;
    const typingViewportTop = (currentCaret.opacity > 0 && typingLayerRect)
      ? currentCaret.top + typingLayerRect.top
      : el.getBoundingClientRect().top;

    const typingHeight = currentCaret.opacity > 0 ? currentCaret.height : el.getBoundingClientRect().height;
    const currentRelativeCenter = (typingViewportTop + typingHeight / 2) - (containerRect.top + containerRect.height / 2);

    // Improved new line detection: check if the vertical offset changed
    const currentOffsetTop = currentCaret.opacity > 0 ? currentCaret.top : el.offsetTop;
    const isLineChanged = lastOffsetTop.current !== null && Math.abs(currentOffsetTop - lastOffsetTop.current) > 10;
    const currentScroll = isWindowScroll ? window.scrollY : container.scrollTop;

    // Always update the spring target to the ideal centered position
    const targetScroll = Math.max(0, currentScroll + currentRelativeCenter);
    springRef.current.target = targetScroll;

    // Proactively activate the spring if we're off-center or the line just changed
    const isSignificantOffCenter = Math.abs(currentRelativeCenter) > 15;

    if (isLineChanged || isSignificantOffCenter) {
      if (!springRef.current.isActive) {
        springRef.current.isActive = true;
        springRef.current.current = currentScroll;
        springRef.current.velocity = 0;
        springRef.current.lastTime = 0;
        animationFrameId.current = requestAnimationFrame(animate);
      }
    }

    lastWordIndex.current = currentIndex;
    lastOffsetTop.current = currentOffsetTop;

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      springRef.current.isActive = false;
    };
  }, [snapshot.currentWordIndex, snapshot.words[snapshot.currentWordIndex]?.typed.length, visibleRange, noScroll, interactionMode]);

  const animate = useCallback((time: number) => {
    const state = springRef.current;
    const el = currentWordRef.current;
    if (!el || !state.isActive) return;

    const container = getScrollContainer(el);
    if (!container) return;

    const isWindowScroll = container === document.body;

    if (state.lastTime === 0) {
      state.lastTime = time;
      animationFrameId.current = requestAnimationFrame(animate);
      return;
    }

    const delta = Math.min(Math.max(0, (time - state.lastTime) / 1000), 0.1);
    state.lastTime = time;

    if (delta > 0) {
      const currentSnapshot = snapshotRef.current;
      const isManualJump = lastWordIndex.current === -1 || Math.abs(currentSnapshot.currentWordIndex - lastWordIndex.current) > 1;
      const stiffness = isManualJump ? 240 : 160;
      const damping = isManualJump ? 32 : 28;

      const displacement = state.current - state.target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * state.velocity;
      const acceleration = springForce + dampingForce;

      state.velocity += acceleration * delta;
      state.current += state.velocity * delta;

      if (isWindowScroll) window.scrollTo(0, state.current);
      else container.scrollTop = state.current;
    }

    if (Math.abs(state.velocity) > 0.05 || Math.abs(state.current - state.target) > 0.05) {
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      state.isActive = false;
      animationFrameId.current = null;
    }
  }, []);

  const [isJumping, setIsJumping] = useState(false);
  const jumpTimeoutRef = useRef<any>(null);
  const stompTimeoutRef = useRef<any>(null);

  // Pre-allocated particle pool for zero-allocation typing effects
  const PARTICLE_POOL_SIZE = 200;
  const particlePool = useRef<any[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 0, size: 0, color: "", active: false, gravity: 0, isWater: false, isPill: false, isHeart: false, isSilk: false
    }))
  );
  const nextParticleIdx = useRef(0);

  const caretTrailRef = useRef<{ wake: () => void } | null>(null);

  // Atomic update for caret position and particle emission
  useLayoutEffect(() => {
    const updateCaretAndEmit = () => {
      if (!containerRef.current || !currentWordRef.current) {
        if (caretPosRef.current.opacity !== 0) {
          caretPosRef.current.opacity = 0;
          if (caretRef.current) caretRef.current.style.opacity = "0";
        }
        return;
      }

      const wordEl = currentWordRef.current;
      const typedLength = snapshot.words[snapshot.currentWordIndex]?.typed.length ?? 0;
      const charEl = (wordEl.children[typedLength] || wordEl.children[wordEl.children.length - 1]) as HTMLElement;

      if (!charEl) return;

      // Use stable offset-based positioning instead of getBoundingClientRect
      // offsetTop/Left are relative to the offsetParent (TypingLayer), making them
      // immune to viewport-relative jitter during simultaneous scrolling.
      const newTop = charEl.offsetTop;
      const newLeft = charEl.offsetLeft;

      // Fallback to charEl's height or a reasonable default
      const charHeight = charEl.offsetHeight || 24;
      const newHeight = charHeight * 0.8;

      const prev = caretPosRef.current;
      const verticalJump = Math.abs(newTop - prev.top);
      const wasHidden = prev.opacity === 0;

      // A jump is required if the vertical distance is large, if the caret was hidden,
      // or if we've detected a manual index change (e.g. clicking a word).
      const indexJump = Math.abs(snapshot.currentWordIndex - prevIdxRef.current) > 1;
      const isJumping = verticalJump > 100 || wasHidden || indexJump;

      prevIdxRef.current = snapshot.currentWordIndex;
      isJumpingRef.current = isJumping;

      if (isJumping) {
        if (jumpTimeoutRef.current) clearTimeout(jumpTimeoutRef.current);
        jumpTimeoutRef.current = setTimeout(() => {
          isJumpingRef.current = false;
          if (caretRef.current && !isStretchingRef.current) {
            const isSilk = settings.theme === "satin-heart";
            caretRef.current.style.transition = isSilk
              ? "transform 50ms cubic-bezier(0.34, 1.56, 0.64, 1), height 50ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 100ms"
              : "transform 60ms ease-out, height 60ms ease-out, opacity 100ms";
          }
          jumpTimeoutRef.current = null;
        }, 50);
      }

      // Calculate distance for particles
      const dx = newLeft - prev.left;
      const dy = newTop - prev.top;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const isSilk = settings.theme === "satin-heart";
      if (caretRef.current) {
        const style = caretRef.current.style;
        style.transform = `translate3d(${newLeft - 0.5}px, ${newTop + (newHeight * 0.1)}px, 0)`;
        style.height = `${newHeight}px`;
        style.opacity = "1";
        const defaultTransition = isSilk
          ? "transform 50ms cubic-bezier(0.34, 1.56, 0.64, 1), height 50ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 100ms"
          : "transform 60ms ease-out, height 60ms ease-out, opacity 100ms";

        style.transition = isJumping ? "none" : (isStretchingRef.current ? "transform 40ms ease-out, height 40ms ease-out" : defaultTransition);
      }

      // Update the ref after the DOM so the next React render is in sync
      caretPosRef.current = { top: newTop, left: newLeft, height: newHeight, opacity: 1 };

      // Particle emission logic
      const isNebula = settings.theme === "nebula-drift";
      const isRainy = settings.theme === "rainy-window";

      if ((isNebula || isRainy || isSilk) && dist > 0.1 && dist < 350) {
        const baseSize = Math.max(1, newHeight * 0.06);
        let emitted = false;

        if (isNebula) {
          const count = dist > 30 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            const t = i / count;
            const p = getInactiveParticle(particlePool.current, nextParticleIdx);
            if (p) {
              p.active = true;
              p.isWater = false;
              p.isHeart = false;
              p.isSilk = false;
              p.x = prev.left + dx * t + (Math.random() - 0.5) * 2;
              p.y = prev.top + dy * t + (Math.random() * newHeight);
              p.vx = (Math.random() - 0.5) * 0.4;
              p.vy = (Math.random() - 0.5) * 0.6;
              p.life = 1.0;
              p.decay = 0.02 + Math.random() * 0.01;
              p.size = (0.7 + Math.random() * 0.7) * baseSize;
              p.color = Math.random() > 0.5 ? "#c084fc" : "#a78bfa";
              p.gravity = 0;
              emitted = true;
            }
          }
        } else if (isRainy && dist > 1) {
          const isJumpStomp = dist > 15;
          if (isJumpStomp) {
            isStretchingRef.current = true;
            if (caretRef.current) {
              // PRESERVE the position while applying the scale
              caretRef.current.style.transform = `translate3d(${newLeft - 0.5}px, ${newTop + (newHeight * 0.1)}px, 0) scaleY(1.3) scaleX(0.7)`;
              caretRef.current.style.transition = "all 40ms ease-out";
            }
            if (stompTimeoutRef.current) clearTimeout(stompTimeoutRef.current);
            stompTimeoutRef.current = setTimeout(() => {
              isStretchingRef.current = false;
              if (caretRef.current) {
                // Use the latest ref coordinates to avoid snapping back to old position
                const p = caretPosRef.current;
                caretRef.current.style.transform = `translate3d(${p.left - 0.5}px, ${p.top + (p.height * 0.1)}px, 0) scaleY(1) scaleX(1)`;
                caretRef.current.style.transition = isJumpingRef.current ? "none" : "all 80ms ease-out";
              }
              stompTimeoutRef.current = null;
            }, 80);
          }

          const stompDir = dx < 0 ? 1 : -1;
          const startXOffset = dx < 0 ? 4 : 0;
          const count = isJumpStomp ? 12 : 5;

          for (let i = 0; i < count; i++) {
            const p = getInactiveParticle(particlePool.current, nextParticleIdx);
            if (p) {
              p.active = true;
              p.isWater = true;
              p.isHeart = false;
              p.isSilk = false;
              p.x = newLeft + startXOffset + (Math.random() - 0.5) * 1.5;
              const pos = Math.random();
              p.y = newTop + newHeight * pos;

              const isCenter = Math.abs(pos - 0.5) < 0.25;
              p.isPill = Math.random() < (isCenter ? 0.3 : 0.85);
              const distMult = isCenter ? (0.1 + Math.random() * 0.05) : (0.3 + Math.random() * 0.15);
              const force = ((isJumpStomp ? 2.6 : 1.8) + Math.random() * 1.2) * distMult;
              p.vx = stompDir * force * (0.7 + Math.random() * 0.6);
              const verticalSpread = (pos - 0.5) * 8.5;
              const noise = (Math.random() - 0.5) * 1.8;
              p.vy = (verticalSpread + noise) * force * 0.4;
              p.life = 1.0;
              p.decay = 0.03 + Math.random() * 0.05;
              p.size = p.isPill ? (1.8 * baseSize) : ((0.5 + Math.random() * 0.5) * baseSize);
              const colorRnd = Math.random();
              p.color = colorRnd > 0.8 ? "#7dd3fc" : (colorRnd > 0.4 ? "#e2e8f0" : "#cbd5e1");
              p.gravity = 0;
              emitted = true;
            }
          }
        } else if (isSilk && dist > 1) {
          // Increased density and randomness for heart particles
          const count = dist > 30 ? (Math.random() > 0.5 ? 2 : 1) : 1;
          for (let i = 0; i < count; i++) {
            if (Math.random() > 0.15) {
              const p = getInactiveParticle(particlePool.current, nextParticleIdx);
              if (p) {
                p.active = true;
                p.isWater = false;
                p.isHeart = true;
                p.isSilk = true;
                p.x = newLeft + (Math.random() - 0.5) * 8;
                p.y = newTop + (newHeight / 2) + (Math.random() - 0.5) * 10;
                p.vx = (Math.random() - 0.5) * 0.4;
                p.vy = -(0.4 + Math.random() * 0.5); // Slightly faster drift
                p.life = 1.0;
                p.decay = 0.01 + Math.random() * 0.015; // Longer life
                p.size = (0.8 + Math.random() * 0.8) * baseSize; // Larger size
                p.color = Math.random() > 0.5 ? "#f43f5e" : "#fb7185";
                p.gravity = 0;
                emitted = true;
              }
            }
          }
        }

        if (emitted) caretTrailRef.current?.wake();
      }
    };

    updateCaretAndEmit();
  }, [snapshot.currentWordIndex, snapshot.words[snapshot.currentWordIndex]?.typed.length, interactionMode, settings.theme, windowStart]);

  // Stable resize handler to prevent listener churn on every keystroke
  useEffect(() => {
    const handleResize = () => {
      // Re-run the positioning logic
      if (currentWordRef.current) {
        const wordEl = currentWordRef.current;
        const typedLength = snapshotRef.current.words[snapshotRef.current.currentWordIndex]?.typed.length ?? 0;
        const charEl = (wordEl.children[typedLength] || wordEl.children[wordEl.children.length - 1]) as HTMLElement;
        if (charEl && caretRef.current) {
          const newTop = charEl.offsetTop;
          const newLeft = charEl.offsetLeft;
          const newHeight = (charEl.offsetHeight || 24) * 0.8;
          caretRef.current.style.transform = `translate3d(${newLeft - 0.5}px, ${newTop + (newHeight * 0.1)}px, 0)`;
          caretRef.current.style.height = `${newHeight}px`;
          caretPosRef.current = { top: newTop, left: newLeft, height: newHeight, opacity: 1 };
        }
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function getInactiveParticle(pool: any[], nextIdx: React.MutableRefObject<number>) {
    const size = pool.length;
    for (let i = 0; i < size; i++) {
      const idx = (nextIdx.current + i) % size;
      if (!pool[idx].active) {
        nextIdx.current = (idx + 1) % size;
        return pool[idx];
      }
    }
    return null;
  }


  return (
    <div
      ref={containerRef}
      style={{
        paddingTop: noScroll ? undefined : "0",
        paddingBottom: noScroll ? undefined : (interactionMode === "read" ? "100vh" : "50vh"),
      }}
      className={cn(
        "relative overflow-hidden whitespace-pre-wrap text-[var(--text)]",
        className,
      )}
    >
      {effectiveSmoothCaret && (
        <div
          ref={caretRef}
          className={cn(
            "absolute z-50 w-[2px] bg-[var(--accent)]",
            settings.theme === "nebula-drift" && "caret-cosmic-pulse",
            settings.theme === "rainy-window" && "caret-liquid-bead",
            settings.theme === "satin-heart" && "caret-silk-glint"
          )}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: caretPosRef.current.height,
            transform: `translate3d(${caretPosRef.current.left - 0.5}px, ${caretPosRef.current.top + (caretPosRef.current.height * 0.1)}px, 0)`,
            opacity: caretPosRef.current.opacity,
            transformOrigin: "bottom",
            transition: isJumpingRef.current ? "none" : (settings.theme === "satin-heart" ? "transform 50ms cubic-bezier(0.34, 1.56, 0.64, 1), height 50ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 100ms" : "transform 60ms ease-out, height 60ms ease-out, opacity 100ms"),
            pointerEvents: "none",
            willChange: "transform",
          }}
        />
      )}

      {(settings.theme === "nebula-drift" || settings.theme === "rainy-window" || settings.theme === "satin-heart") && (
        <CaretTrail ref={caretTrailRef} particles={particlePool.current} />
      )}

      {visibleTokens.length > 0 && tokens[visibleTokens[0].index].start > (visibleRange?.start ?? 0) && (
        <span style={{ visibility: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }} aria-hidden="true">
          {chapterText.substring(visibleRange?.start ?? 0, tokens[visibleTokens[0].index].start)}
        </span>
      )}
      {visibleTokens.map(({ token, index }) => (
        <Word
          key={token.id}
          ref={index === snapshot.currentWordIndex ? currentWordRef : null}
          index={index}
          token={token}
          state={snapshot.words[index]}
          isCurrent={index === snapshot.currentWordIndex}
          isCompleted={index < snapshot.currentWordIndex}
          isUpcoming={index > snapshot.currentWordIndex}
          distance={Math.abs(index - snapshot.currentWordIndex)}
          faded={faded && !visibleRange}
          compareOptions={compareOptions}
          onClick={onWordClick}
          interactionMode={interactionMode}
          smoothCaret={effectiveSmoothCaret}
          botCursorIndex={botCursorIndex}
        />
      ))}
      {visibleTokens.length > 0 && tokens[visibleTokens[visibleTokens.length - 1].index].end < (visibleRange?.end ?? chapterText.length) && (
        <span style={{ visibility: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }} aria-hidden="true">
          {chapterText.substring(tokens[visibleTokens[visibleTokens.length - 1].index].end, visibleRange?.end ?? chapterText.length)}
        </span>
      )}
    </div>
  );
}

function lowerBoundTokenStart(tokens: TokenizedWord[], target: number) {
  let low = 0;
  let high = tokens.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (tokens[mid].start < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

const Word = memo(
  forwardRef<
    HTMLSpanElement,
    {
      index: number;
      token: TokenizedWord;
      state: WordTypingState | undefined;
      isCurrent: boolean;
      isCompleted: boolean;
      isUpcoming: boolean;
      distance: number;
      faded: boolean;
      compareOptions?: { ignoredCharacters?: ReadonlySet<string> };
      onClick?: (index: number) => void;
      interactionMode?: InteractionMode;
      smoothCaret?: boolean;
      botCursorIndex?: number | null;
    }
  >(({ index, token, state, isCurrent, isCompleted, isUpcoming, distance, faded, compareOptions, onClick, interactionMode, smoothCaret, botCursorIndex }, ref) => {
    // Calculate opacity inline to avoid hook overhead in the large word list
    let opacity = 1;
    if (faded) {
      if (distance > 80) opacity = 0.15;
      else if (distance > 36) opacity = 0.35;
      else if (distance > 12) opacity = 0.62;
    }

    const botInThisWord = botCursorIndex !== null && botCursorIndex !== undefined && botCursorIndex >= token.start && botCursorIndex <= token.end;

    if (interactionMode === "read") {
      return (
        <span
          data-word-index={index}
          className={cn("text-[var(--text)] transition hover:text-[var(--accent)]", onClick && "cursor-pointer")}
          onClick={onClick ? () => onClick(index) : undefined}
        >
          {token.word + token.separator}
        </span>
      );
    }

    if (isUpcoming && !botInThisWord) {
      return (
        <span
          data-word-index={index}
          className={cn("text-[var(--text-muted)] transition hover:text-[var(--text)]", onClick && "cursor-text")}
          style={{ opacity }}
          onClick={onClick ? () => onClick(index) : undefined}
        >
          {token.word + token.separator}
        </span>
      );
    }

    if (isCompleted && !botInThisWord) {
      const isPerfect = state
        ? normalizeForCompare(state.typed, compareOptions?.ignoredCharacters) ===
        normalizeForCompare(token.word + token.separator, compareOptions?.ignoredCharacters)
        : true;

      if (isPerfect) {
        return (
          <span
            data-word-index={index}
            className={cn("text-[var(--success)] transition hover:opacity-70", onClick && "cursor-text")}
            style={{ opacity }}
            onClick={onClick ? () => onClick(index) : undefined}
          >
            {token.word + token.separator}
          </span>
        );
      }
    }

    return (
      <span
        ref={ref}
        data-word-index={index}
        className={cn("transition duration-300", onClick && "cursor-text")}
        style={{ opacity }}
        onClick={onClick ? () => onClick(index) : undefined}
      >
        {renderWordParts(
          token.word + token.separator,
          state?.typed ?? "",
          isCurrent,
          isCompleted,
          state?.skipped ?? false,
          compareOptions?.ignoredCharacters,
          smoothCaret,
          botCursorIndex !== null && botCursorIndex !== undefined && botCursorIndex >= token.start && botCursorIndex <= token.end ? Math.floor(botCursorIndex) - token.start : null,
        )}
      </span>
    );
  }));

const CaretTrail = memo(forwardRef(({ particles }: { particles: any[] }, ref) => {
  const particlesRef = useRef(particles);
  particlesRef.current = particles;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>(0);
  const isLoopRunning = useRef(false);
  const hasEllipse = useRef<boolean | null>(null);
  const heartSpritesRef = useRef<HTMLCanvasElement[]>([]);

  // High-performance layout caching to prevent 60fps reflows
  const parentRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const parentRectRef = useRef<{ top: number; left: number; scrollT: number; scrollL: number } | null>(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const colors = ["#f43f5e", "#fb7185"];
    heartSpritesRef.current = colors.map(color => {
      const c = document.createElement("canvas");
      const baseSize = 32;
      c.width = baseSize * dpr;
      c.height = baseSize * dpr;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        const x = baseSize / 2;
        const y = 0;
        const size = baseSize;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + size / 4);
        ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
        ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.8, x, y + size);
        ctx.bezierCurveTo(x, y + size * 0.8, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
        ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
        ctx.fill();
      }
      return c;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    parentRef.current = canvas.parentElement;
    scrollContainerRef.current = getScrollContainer(parentRef.current);

    const invalidate = () => {
      if (!parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      const sc = scrollContainerRef.current;
      parentRectRef.current = {
        top: rect.top,
        left: rect.left,
        scrollT: sc ? (sc === document.body ? window.scrollY : sc.scrollTop) : 0,
        scrollL: sc ? (sc === document.body ? window.scrollX : sc.scrollLeft) : 0,
      };
    };
    window.addEventListener("scroll", invalidate, { capture: true, passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    return () => {
      window.removeEventListener("scroll", invalidate, true);
      window.removeEventListener("resize", invalidate);
    };
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (hasEllipse.current === null) {
      hasEllipse.current = typeof ctx.ellipse === "function";
    }

    const dpr = window.devicePixelRatio || 1;

    // Get the viewport-relative position of the parent without triggering reflow
    const parent = parentRef.current;
    if (!parent) return;

    if (!parentRectRef.current) {
      const rect = parent.getBoundingClientRect();
      const sc = scrollContainerRef.current;
      parentRectRef.current = {
        top: rect.top,
        left: rect.left,
        scrollT: sc ? (sc === document.body ? window.scrollY : sc.scrollTop) : 0,
        scrollL: sc ? (sc === document.body ? window.scrollX : sc.scrollLeft) : 0,
      };
    }

    const cache = parentRectRef.current;
    const sc = scrollContainerRef.current;
    const currT = sc ? (sc === document.body ? window.scrollY : sc.scrollTop) : 0;
    const currL = sc ? (sc === document.body ? window.scrollX : sc.scrollLeft) : 0;

    // Calculate current viewport position based on scroll delta WITHOUT triggering a fresh getBoundingClientRect()
    const parentViewportTop = cache.top - (currT - cache.scrollT);
    const parentViewportLeft = cache.left - (currL - cache.scrollL);

    const currentParticles = particlesRef.current;
    const len = currentParticles.length;

    // First pass: check if we even need to clear and draw
    let activeInViewport = false;
    for (let i = 0; i < len; i++) {
      if (currentParticles[i].active) {
        activeInViewport = true;
        break;
      }
    }

    if (!activeInViewport) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isLoopRunning.current = false;
      animationFrameId.current = 0;
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let hasActiveNow = false;
    let lastMode = "";
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < len; i++) {
      const p = currentParticles[i];
      if (!p.active) continue;

      p.x += p.vx;
      p.y += p.vy;
      if (p.gravity) p.vy += p.gravity;
      p.life -= p.decay;

      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      const drawX = p.x + parentViewportLeft;
      const drawY = p.y + parentViewportTop;

      if (drawX < -50 || drawX > window.innerWidth + 50 || drawY < -50 || drawY > window.innerHeight + 50) {
        continue;
      }

      hasActiveNow = true;

      if (p.isWater) {
        if (lastMode !== "source-over") {
          ctx.globalCompositeOperation = "source-over";
          lastMode = "source-over";
        }

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const stretch = p.isPill ? Math.max(1.8, speed * 0.6) : 1;
        const angle = Math.atan2(p.vy, p.vx) || 0;

        const radiusX = Math.max(0.5, p.size * stretch);
        const radiusY = Math.max(0.5, p.size * (p.isPill ? 0.6 : 1.0));

        const baseAlpha = p.isPill ? 0.45 : 0.8;
        ctx.globalAlpha = Math.max(0, p.life * baseAlpha);
        ctx.fillStyle = p.color;

        ctx.beginPath();
        if (hasEllipse.current) {
          ctx.ellipse(drawX, drawY, radiusX, radiusY, angle, 0, Math.PI * 2);
        } else {
          ctx.arc(drawX, drawY, radiusX, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = Math.max(0, p.life * (p.isPill ? 0.35 : 0.7));
        const highlightSize = Math.max(0.2, p.size * 0.4);
        ctx.arc(drawX - p.size * 0.15, drawY - p.size * 0.15, highlightSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.isHeart) {
        if (lastMode !== "source-over") {
          ctx.globalCompositeOperation = "source-over";
          lastMode = "source-over";
        }

        ctx.globalAlpha = Math.max(0, p.life * 0.65);

        const size = p.size * 2.5;
        const spriteIdx = p.color === "#f43f5e" ? 0 : 1;
        const sprite = heartSpritesRef.current[spriteIdx];
        if (sprite) {
          ctx.drawImage(sprite, drawX - size / 2, drawY - size / 2, size, size);
        }
      } else {
        // Nebula / Cosmic Glow
        if (lastMode !== "lighter") {
          ctx.globalCompositeOperation = "lighter";
          lastMode = "lighter";
        }

        ctx.globalAlpha = Math.max(0, p.life * 0.45);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(drawX, drawY, Math.max(0.1, p.size * 2.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.max(0, p.life * 0.9);
        ctx.beginPath();
        ctx.arc(drawX, drawY, Math.max(0.1, p.size * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Reset for next frame/other drawing
    if (lastMode !== "source-over") {
      ctx.globalCompositeOperation = "source-over";
    }

    if (hasActiveNow) {
      animationFrameId.current = requestAnimationFrame(render);
    } else {
      isLoopRunning.current = false;
      animationFrameId.current = 0;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    wake: () => {
      if (!isLoopRunning.current) {
        isLoopRunning.current = true;
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = requestAnimationFrame(render);
      }
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }
    resize();

    return () => {
      observer.disconnect();
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    />
  );
}));

function renderWordParts(
  expected: string,
  typed: string,
  current: boolean,
  completed: boolean,
  skipped: boolean,
  ignoredCharacters?: ReadonlySet<string>,
  smoothCaret = false,
  botCursorOffset: number | null = null,
) {
  const expectedChars = [...expected];
  const typedChars = [...typed];
  const output: JSX.Element[] = [];
  const cursorIndex = current ? typedChars.length : -1;

  for (let index = 0; index < expectedChars.length; index += 1) {
    const expectedChar = expectedChars[index];
    const typedChar = typedChars[index];

    let charClass = "text-[var(--text-muted)]";
    if (typedChar !== undefined) {
      const correct = normalizeForCompare(typedChar, ignoredCharacters) === normalizeForCompare(expectedChar, ignoredCharacters);
      charClass = correct ? "text-[var(--success)]" : "text-[var(--danger)] underline decoration-[var(--danger)]/60";
    } else if (skipped) {
      charClass = "text-[var(--text-muted)]/60 line-through";
    } else if (completed) {
      charClass = "text-[var(--text-muted)]";
    } else if (current) {
      charClass = "text-[var(--text)]";
    }

    output.push(
      <span key={index} className={cn("relative", charClass)}>
        {!smoothCaret && index === cursorIndex && (
          <span
            className="absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] animate-pulse bg-[var(--accent)]"
          />
        )}
        {index === (botCursorOffset !== null ? Math.floor(botCursorOffset) : -1) && (
          <span
            className="absolute -left-[0.5px] top-[10%] z-50 h-[80%] w-[2px] bg-[#00ffff] opacity-90 shadow-[0_0_8px_#00ffff] transition-all duration-100"
          />
        )}
        {expectedChar}
      </span>
    );
  }

  if (cursorIndex === expectedChars.length) {
    output.push(
      <span key="cursor-end" className="relative">
        {!smoothCaret && (
          <span
            className="absolute -left-[0.5px] top-[10%] z-50 h-[80%] w-[2px] animate-pulse bg-[var(--accent)]"
          />
        )}
        {(botCursorOffset !== null ? Math.floor(botCursorOffset) : -1) === expectedChars.length && (
          <span
            className="absolute -left-[0.5px] top-[10%] z-50 h-[80%] w-[2px] bg-[#00ffff] opacity-90 shadow-[0_0_8px_#00ffff] transition-all duration-100"
          />
        )}
      </span>
    );
  } else if ((botCursorOffset !== null ? Math.floor(botCursorOffset) : -1) === expectedChars.length) {
    output.push(
      <span key="bot-cursor-end" className="relative">
        <span
          className="absolute -left-[0.5px] top-[10%] z-50 h-[80%] w-[2px] bg-[#00ffff] opacity-90 shadow-[0_0_8px_#00ffff] transition-all duration-100"
        />
      </span>
    );
  }

  return output;
}
