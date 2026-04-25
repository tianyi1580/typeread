import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/utils";
import type { InteractionMode, TokenizedWord, TypingSnapshot } from "../types";
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
  const [windowStart, setWindowStart] = React.useState(0);
  const WINDOW_SIZE = 300;
  const BUFFER = 80;
  const preShiftRelativeTop = useRef<number | null>(null);

  // Buffered windowing to prevent shifting the DOM on every single word.
  useEffect(() => {
    if (visibleRange || noScroll) return;
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
  }, [snapshot.currentWordIndex, windowStart, visibleRange, noScroll]);

  const animationRef = useRef<{ 
    startY: number; 
    distance: number; 
    startTime: number;
    duration: number;
  } | null>(null);

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
          container.scrollTop += delta;
          // IMPORTANT: If an animation is running, we must adjust its starting point
          // to account for the DOM shift, otherwise it will "snap" or drift.
          if (animationRef.current) {
            animationRef.current.startY += delta;
          }
        }
      }
      preShiftRelativeTop.current = null;
    }
  }, [windowStart]);

  const visibleTokens = useMemo(() => {
    if (visibleRange) {
      return tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => token.start >= visibleRange.start && token.start < visibleRange.end);
    }

    const start = windowStart;
    const end = Math.min(tokens.length, start + WINDOW_SIZE);

    return tokens
      .slice(start, end)
      .map((token, index) => ({ token, index: start + index }));
  }, [tokens, visibleRange, windowStart]);

  const scrollAnimationId = useRef<number | null>(null);
  const lastWordIndex = useRef<number>(-1);

  // Smooth scroll logic that ensures the active word is ALWAYS perfectly centered.
  useEffect(() => {
    const el = currentWordRef.current;
    if (noScroll || visibleRange || !el) return;

    const currentIndex = snapshot.currentWordIndex;

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
    
    // Check if the word is currently centered.
    // We target the vertical middle of the element to the vertical middle of the container.
    const currentRelativeCenter = (elRect.top + elRect.height / 2) - (containerRect.top + containerRect.height / 2);
    const isManualJump = Math.abs(currentIndex - lastWordIndex.current) > 1;
    
    // We trigger centering if:
    // 1. We just moved to a new word and it's not centered (allow 2px slack)
    // 2. It's a manual jump
    // 3. It's the first initialization
    if (Math.abs(currentRelativeCenter) > 2 || isManualJump || lastWordIndex.current === -1) {
      if (scrollAnimationId.current !== null) {
        cancelAnimationFrame(scrollAnimationId.current);
      }

      const currentScroll = isWindowScroll ? window.scrollY : container.scrollTop;
      const distance = currentRelativeCenter;
      const duration = isManualJump ? 250 : 400;

      animationRef.current = {
        startY: currentScroll,
        distance,
        startTime: performance.now(),
        duration,
      };

      const animate = (currentTime: number) => {
        if (!animationRef.current) return;
        
        const state = animationRef.current;
        const timeElapsed = currentTime - state.startTime;
        const progress = Math.min(timeElapsed / state.duration, 1);
        
        const ease = 1 - Math.pow(1 - progress, 4);
        const nextScroll = state.startY + state.distance * ease;

        if (isWindowScroll) {
          window.scrollTo(0, nextScroll);
        } else {
          container!.scrollTop = nextScroll;
        }

        if (timeElapsed < state.duration) {
          scrollAnimationId.current = requestAnimationFrame(animate);
        } else {
          scrollAnimationId.current = null;
          animationRef.current = null;
        }
      };
      scrollAnimationId.current = requestAnimationFrame(animate);
    }

    lastWordIndex.current = currentIndex;

    return () => {
      if (scrollAnimationId.current !== null) {
        cancelAnimationFrame(scrollAnimationId.current);
        scrollAnimationId.current = null;
      }
    };
  }, [snapshot.currentWordIndex, visibleRange, noScroll]);


  return (
    <div
      className={cn(
        "whitespace-pre-wrap text-[var(--text)]",
        className,
      )}
    >
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

const Word = React.memo(
  React.forwardRef<
    HTMLSpanElement,
    {
      index: number;
      token: TokenizedWord;
      state: any;
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
        {index === cursorIndex && (
          <span
            className={cn(
              "absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] bg-[var(--accent)]",
              smoothCaret ? "transition-all duration-150 ease-out" : "animate-pulse",
            )}
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
        <span
          className={cn(
            "absolute -left-[0.5px] top-[10%] z-50 h-[80%] w-[2px] bg-[var(--accent)]",
            smoothCaret ? "transition-all duration-150 ease-out" : "animate-pulse",
          )}
        />
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
