import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/utils";
import type { InteractionMode, TokenizedWord, TypingSnapshot, WordTypingState } from "../types";
import { normalizeForCompare } from "../utils/typing";

interface TypingLayerProps {
  tokens: TokenizedWord[];
  snapshot: TypingSnapshot;
  chapterText: string;
  visibleRange?: { start: number; end: number };
  noScroll?: boolean;
  className?: string;
  faded?: boolean;
  compareOptions?: {
    ignoredCharacters?: ReadonlySet<string>;
  };
  onWordClick?: (wordIndex: number) => void;
  interactionMode?: InteractionMode;
  smoothCaret?: boolean;
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
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const WINDOW_SIZE = 300;
  const BUFFER = 80;
  const [windowStart, setWindowStart] = React.useState(() => {
    if (visibleRange || noScroll) return 0;
    const current = snapshot.currentWordIndex;
    return Math.max(0, current - Math.floor(WINDOW_SIZE / 2));
  });
  const preShiftRelativeTop = useRef<number | null>(null);
  const lastOffsetTop = useRef<number | null>(null);
  const lastWordIndex = useRef<number>(-1);
  const animationFrameId = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [caretStyle, setCaretStyle] = React.useState<{ top: number; left: number; height: number; opacity: number }>({ top: 0, left: 0, height: 0, opacity: 0 });

  // Buffered windowing to prevent shifting the DOM on every single word.
  useEffect(() => {
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
  React.useLayoutEffect(() => {
    if (preShiftRelativeTop.current !== null && currentWordRef.current) {
      const el = currentWordRef.current;
      let container: HTMLElement | null = el.parentElement;
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        if (/(auto|scroll|hidden)/.test(style.overflowY) && container.offsetHeight < container.scrollHeight) {
          break;
        }
        container = container.parentElement;
      }
      
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
  React.useLayoutEffect(() => {
    const el = currentWordRef.current;
    if (noScroll || visibleRange || !el) return;

    const currentIndex = snapshot.currentWordIndex;
    const isManualJump = lastWordIndex.current === -1 || Math.abs(currentIndex - lastWordIndex.current) > 1;

    if (isManualJump) {
      let container: HTMLElement | null = el.parentElement;
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        if (/(auto|scroll|hidden)/.test(style.overflowY) && container.offsetHeight < container.scrollHeight) {
          break;
        }
        container = container.parentElement;
      }
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
    let container: HTMLElement | null = el.parentElement;
    while (container && container !== document.body) {
      const style = window.getComputedStyle(container);
      if (/(auto|scroll|hidden)/.test(style.overflowY) && container.offsetHeight < container.scrollHeight) {
        break;
      }
      container = container.parentElement;
    }
    if (!container) return;

    const isWindowScroll = container === document.body;
    const containerRect = isWindowScroll 
      ? { top: 0, height: window.innerHeight } 
      : container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    
    const currentRelativeCenter = (elRect.top + elRect.height / 2) - (containerRect.top + containerRect.height / 2);
    
    // Improved new line detection: check if the vertical offset changed since the last word we processed
    const currentOffsetTop = el.offsetTop;
    const isLineChanged = lastOffsetTop.current !== null && Math.abs(currentOffsetTop - lastOffsetTop.current) > 10;
    const currentScroll = isWindowScroll ? window.scrollY : container.scrollTop;

    if (isLineChanged) {
      springRef.current.target = Math.max(0, currentScroll + currentRelativeCenter);
      
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
  }, [snapshot.currentWordIndex, visibleRange, noScroll, interactionMode]);

  const animate = (time: number) => {
    const state = springRef.current;
    const el = currentWordRef.current;
    if (!el || !state.isActive) return;
    
    let container: HTMLElement | null = el.parentElement;
    while (container && container !== document.body) {
      const style = window.getComputedStyle(container);
      if (/(auto|scroll|hidden)/.test(style.overflowY) && container.offsetHeight < container.scrollHeight) {
        break;
      }
      container = container.parentElement;
    }
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
      const isManualJump = lastWordIndex.current === -1 || Math.abs(snapshot.currentWordIndex - lastWordIndex.current) > 1;
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
  };

  useEffect(() => {
    const updateCaret = () => {
      if (!containerRef.current) return;

      if (!currentWordRef.current) {
        setCaretStyle((prev) => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
        return;
      }
      
      const wordEl = currentWordRef.current;
      const typedLength = snapshot.words[snapshot.currentWordIndex]?.typed.length ?? 0;
      const charEl = wordEl.children[typedLength] as HTMLElement;
      
      if (charEl) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const charRect = charEl.getBoundingClientRect();
        
        setCaretStyle({
          top: charRect.top - containerRect.top + containerRef.current.scrollTop,
          left: charRect.left - containerRect.left,
          height: charRect.height * 0.8,
          opacity: 1,
        });
      } else {
        setCaretStyle((prev) => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
      }
    };

    updateCaret();
    // Also update on window resize or potential font loads
    window.addEventListener("resize", updateCaret);
    return () => window.removeEventListener("resize", updateCaret);
  }, [snapshot.currentWordIndex, snapshot.words[snapshot.currentWordIndex]?.typed.length, interactionMode]);


  return (
    <div
      ref={containerRef}
      style={{
        paddingTop: noScroll ? undefined : "0",
        paddingBottom: noScroll ? undefined : (interactionMode === "read" ? "100vh" : "50vh"),
      }}
      className={cn(
        "relative whitespace-pre-wrap text-[var(--text)]",
        className,
      )}
    >
      {smoothCaret && (
        <div
          className="absolute z-50 w-[2px] bg-[var(--accent)] transition-all duration-100 ease-out"
          style={{
            top: caretStyle.top + (caretStyle.height * 0.1),
            left: caretStyle.left - 0.5,
            height: caretStyle.height,
            opacity: caretStyle.opacity,
          }}
        />
      )}

      {visibleRange && visibleTokens.length > 0 && tokens[visibleTokens[0].index].start > visibleRange.start && (
        <span className="text-[var(--text-muted)] opacity-0">
          {chapterText.substring(visibleRange.start, tokens[visibleTokens[0].index].start)}
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
          smoothCaret={smoothCaret}
          botCursorIndex={botCursorIndex}
        />
      ))}
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

const Word = React.memo(
  React.forwardRef<
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
          smoothCaret ?? false,
          botCursorIndex !== null && botCursorIndex !== undefined && botCursorIndex >= token.start && botCursorIndex <= token.end ? Math.floor(botCursorIndex) - token.start : null,
        )}
      </span>
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
