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
  const visibleTokens = useMemo(() => {
    if (visibleRange) {
      return tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => token.start >= visibleRange.start && token.start < visibleRange.end);
    }

    const WINDOW_SIZE = 400; // Reduced for peak performance during rapid typing
    const start = Math.max(0, snapshot.currentWordIndex - WINDOW_SIZE / 2);
    const end = Math.min(tokens.length, start + WINDOW_SIZE);

    return tokens
      .slice(start, end)
      .map((token, index) => ({ token, index: start + index }));
  }, [tokens, visibleRange, snapshot.currentWordIndex]);

  const scrollAnimationRef = useRef<number | null>(null);
  const lastOffsetTop = useRef<number>(-1);
  const lastWordIndex = useRef<number>(-1);

  useEffect(() => {
    const el = currentWordRef.current;
    if (noScroll || visibleRange || !el) return;

    const currentIndex = snapshot.currentWordIndex;
    const currentOffset = el.offsetTop;

    // First run initialization
    if (lastWordIndex.current === -1) {
      lastWordIndex.current = currentIndex;
      lastOffsetTop.current = currentOffset;
      return;
    }

    // Only perform expensive layout checks and scrolling when the word index actually changes.
    // Within-word typing no longer triggers reflows, eliminating input lag.
    if (currentIndex !== lastWordIndex.current) {
      const offsetDiff = Math.abs(currentOffset - lastOffsetTop.current);

      if (offsetDiff > 15) {
        if (scrollAnimationRef.current !== null) {
          cancelAnimationFrame(scrollAnimationRef.current);
        }

        // Find the nearest scrollable ancestor
        let container: HTMLElement | null = el.parentElement;
        while (container && container !== document.body) {
          const style = window.getComputedStyle(container);
          if (/(auto|scroll|hidden)/.test(style.overflowY) && container.offsetHeight < container.scrollHeight) {
            break;
          }
          container = container.parentElement;
        }

        const isWindowScroll = !container || container === document.body;

        if (isWindowScroll) {
          const targetY = el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2;
          const startY = window.scrollY;
          const distance = targetY - startY;
          const duration = 500;
          let startTime: number | null = null;

          const animate = (currentTime: number) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 5);
            window.scrollTo(0, startY + distance * ease);
            if (timeElapsed < duration) {
              scrollAnimationRef.current = requestAnimationFrame(animate);
            } else {
              scrollAnimationRef.current = null;
            }
          };
          scrollAnimationRef.current = requestAnimationFrame(animate);
        } else {
          const targetY = el.offsetTop - container!.offsetHeight / 2 + el.offsetHeight / 2;
          const startY = container!.scrollTop;
          const distance = targetY - startY;
          const duration = 400;
          let startTime: number | null = null;

          const animate = (currentTime: number) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 5);
            container!.scrollTop = startY + distance * ease;
            if (timeElapsed < duration) {
              scrollAnimationRef.current = requestAnimationFrame(animate);
            } else {
              scrollAnimationRef.current = null;
            }
          };
          scrollAnimationRef.current = requestAnimationFrame(animate);
        }
      }

      lastOffsetTop.current = currentOffset;
      lastWordIndex.current = currentIndex;
    }

    return () => {
      if (scrollAnimationRef.current !== null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
    };
  }, [snapshot.currentWordIndex, visibleRange]);

  // Handle window resizing separately to avoid mixing it with typing logic
  useEffect(() => {
    const handleResize = () => {
      const el = currentWordRef.current;
      if (el) {
        lastOffsetTop.current = el.offsetTop;
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
