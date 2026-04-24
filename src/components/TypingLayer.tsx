import { useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/utils";
import type { TokenizedWord, TypingSnapshot } from "../types";
import { normalizeForCompare } from "../utils/typing";

interface TypingLayerProps {
  tokens: TokenizedWord[];
  snapshot: TypingSnapshot;
  visibleRange?: { start: number; end: number };
  className?: string;
  faded?: boolean;
}

export function TypingLayer({ tokens, snapshot, visibleRange, className, faded = true }: TypingLayerProps) {
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const visibleTokens = useMemo(() => {
    if (visibleRange) {
      return tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => token.start >= visibleRange.start && token.end <= visibleRange.end);
    }

    // Virtualization Window: Only render words within a relative distance to the current typing position.
    // This prevents DOM bloat in long chapters while keeping enough context for scrolling.
    const WINDOW_SIZE = 400; // Render 200 before and 200 after
    const start = Math.max(0, snapshot.currentWordIndex - WINDOW_SIZE / 2);
    const end = Math.min(tokens.length, start + WINDOW_SIZE);
    
    return tokens
      .slice(start, end)
      .map((token, index) => ({ token, index: start + index }));
  }, [tokens, visibleRange, snapshot.currentWordIndex]);

  useEffect(() => {
    if (!visibleRange && currentWordRef.current) {
      currentWordRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [snapshot.currentWordIndex, visibleRange]);

  return (
    <div
      className={cn(
        "whitespace-pre-wrap leading-[2.05] tracking-[0.01em] text-[var(--text)]",
        className,
      )}
    >
      {visibleTokens.map(({ token, index }) => {
        const state = snapshot.words[index];
        const current = index === snapshot.currentWordIndex;
        const distance = Math.abs(index - snapshot.currentWordIndex);
        const opacity =
          !faded || visibleRange
            ? 1
            : distance > 80
              ? 0.15
              : distance > 36
                ? 0.35
                : distance > 12
                  ? 0.62
                  : 1;

        return (
          <span
            key={token.id}
            ref={current ? currentWordRef : null}
            className={cn("transition-opacity duration-300", current && "rounded-md bg-[var(--accent-soft)]")}
            style={{ opacity }}
          >
            {renderWord(token.word, state?.typed ?? "", current, state?.completed ?? false, state?.skipped ?? false)}
            <span className="text-[var(--text-muted)]">{token.separator}</span>
          </span>
        );
      })}
    </div>
  );
}

function renderWord(expected: string, typed: string, current: boolean, completed: boolean, skipped: boolean) {
  const expectedChars = [...expected];
  const typedChars = [...typed];
  const output: JSX.Element[] = [];
  let cursorPlaced = false;

  if (current && typedChars.length === 0 && !skipped) {
    output.push(cursor("cursor-start"));
    cursorPlaced = true;
  }

  const total = Math.max(expectedChars.length, typedChars.length);
  for (let index = 0; index < total; index += 1) {
    const expectedChar = expectedChars[index];
    const typedChar = typedChars[index];

    if (typedChar !== undefined) {
      const correct = normalizeForCompare(typedChar) === normalizeForCompare(expectedChar ?? "");
      output.push(
        <span
          key={`typed-${index}`}
          className={correct ? "text-[var(--success)]" : "text-[var(--danger)] underline decoration-[var(--danger)]/60"}
        >
          {typedChar}
        </span>,
      );
    } else if (expectedChar !== undefined) {
      if (current && !cursorPlaced) {
        output.push(cursor(`cursor-${index}`));
        cursorPlaced = true;
      }

      output.push(
        <span
          key={`expected-${index}`}
          className={cn(
            skipped && "text-[var(--text-muted)]/60 line-through",
            !skipped && completed && "text-[var(--text-muted)]",
            !skipped && !completed && "text-[var(--text)]",
          )}
        >
          {expectedChar}
        </span>,
      );
    }
  }

  if (current && !cursorPlaced) {
    output.push(cursor("cursor-end"));
  }

  return output;
}

function cursor(key: string) {
  return (
    <span key={key} className="animate-pulse text-[var(--accent)]">
      |
    </span>
  );
}
