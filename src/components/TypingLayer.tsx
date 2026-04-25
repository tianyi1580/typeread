import React, { useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/utils";
import type { TokenizedWord, TypingSnapshot } from "../types";
import { normalizeForCompare } from "../utils/typing";

interface TypingLayerProps {
  tokens: TokenizedWord[];
  snapshot: TypingSnapshot;
  visibleRange?: { start: number; end: number };
  className?: string;
  faded?: boolean;
  compareOptions?: {
    ignoreQuotationMarks?: boolean;
  };
}

export function TypingLayer({ tokens, snapshot, visibleRange, className, faded = true, compareOptions }: TypingLayerProps) {
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const visibleTokens = useMemo(() => {
    if (visibleRange) {
      return tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => token.start >= visibleRange.start && token.end <= visibleRange.end);
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
    if (visibleRange || !el) return;

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

        const targetY = el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2;
        const startY = window.scrollY;
        const distance = targetY - startY;
        const duration = 500; // Snappier response
        let startTime: number | null = null;

        const animate = (currentTime: number) => {
          if (startTime === null) startTime = currentTime;
          const timeElapsed = currentTime - startTime;
          const progress = Math.min(timeElapsed / duration, 1);

          // smooth easeOutQuint
          const ease = 1 - Math.pow(1 - progress, 5);

          window.scrollTo(0, startY + distance * ease);

          if (timeElapsed < duration) {
            scrollAnimationRef.current = requestAnimationFrame(animate);
          } else {
            scrollAnimationRef.current = null;
          }
        };

        scrollAnimationRef.current = requestAnimationFrame(animate);
      }

      lastOffsetTop.current = currentOffset;
      lastWordIndex.current = currentIndex;
    }
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
        "whitespace-pre-wrap leading-[2.05] tracking-[0.01em] text-[var(--text)]",
        className,
      )}
    >
      {visibleTokens.map(({ token, index }) => (
        <Word
          key={token.id}
          ref={index === snapshot.currentWordIndex ? currentWordRef : null}
          token={token}
          state={snapshot.words[index]}
          isCurrent={index === snapshot.currentWordIndex}
          isCompleted={index < snapshot.currentWordIndex}
          isUpcoming={index > snapshot.currentWordIndex}
          distance={Math.abs(index - snapshot.currentWordIndex)}
          faded={faded && !visibleRange}
          compareOptions={compareOptions}
        />
      ))}
    </div>
  );
}

const Word = React.memo(
  React.forwardRef<
    HTMLSpanElement,
    {
      token: TokenizedWord;
      state: any;
      isCurrent: boolean;
      isCompleted: boolean;
      isUpcoming: boolean;
      distance: number;
      faded: boolean;
      compareOptions?: { ignoreQuotationMarks?: boolean };
    }
  >(({ token, state, isCurrent, isCompleted, isUpcoming, distance, faded, compareOptions }, ref) => {
    // Calculate opacity inline to avoid hook overhead in the large word list
    let opacity = 1;
    if (faded) {
      if (distance > 80) opacity = 0.15;
      else if (distance > 36) opacity = 0.35;
      else if (distance > 12) opacity = 0.62;
    }

    if (isUpcoming) {
      return (
        <span className="text-[var(--text-muted)]" style={{ opacity }}>
          {token.word + token.separator}
        </span>
      );
    }

    if (isCompleted) {
      const isPerfect = state
        ? normalizeForCompare(state.typed, compareOptions?.ignoreQuotationMarks) ===
        normalizeForCompare(token.word + token.separator, compareOptions?.ignoreQuotationMarks)
        : true;

      if (isPerfect) {
        return (
          <span className="text-[var(--success)]" style={{ opacity }}>
            {token.word + token.separator}
          </span>
        );
      }
    }

    return (
      <span ref={ref} className="transition-opacity duration-300" style={{ opacity }}>
        {renderWordParts(token.word + token.separator, state?.typed ?? "", isCurrent, isCompleted, state?.skipped ?? false)}
      </span>
    );
  }));

function renderWordParts(expected: string, typed: string, current: boolean, completed: boolean, skipped: boolean) {
  const expectedChars = [...expected];
  const typedChars = [...typed];
  const output: JSX.Element[] = [];
  const cursorIndex = current ? typedChars.length : -1;

  for (let index = 0; index < expectedChars.length; index += 1) {
    const expectedChar = expectedChars[index];
    const typedChar = typedChars[index];

    let charClass = "text-[var(--text-muted)]";
    if (typedChar !== undefined) {
      const correct = normalizeForCompare(typedChar) === normalizeForCompare(expectedChar);
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
          <span className="absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] animate-pulse bg-[var(--accent)]" />
        )}
        {expectedChar}
      </span>
    );
  }

  if (cursorIndex === expectedChars.length) {
    output.push(
      <span key="cursor-end" className="relative">
        <span className="absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] animate-pulse bg-[var(--accent)]" />
      </span>
    );
  }

  return output;
}
