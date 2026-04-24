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

  const lastOffsetTop = useRef<number>(-1);
  useEffect(() => {
    const el = currentWordRef.current;
    if (!visibleRange && el) {
      const currentOffset = el.offsetTop;
      
      // Initialize on first word
      if (lastOffsetTop.current === -1) {
        lastOffsetTop.current = currentOffset;
        return;
      }

      // Only scroll if we've moved to a NEW line (significant increase in offsetTop)
      // We use 15px to be safe against sub-pixel font rendering differences
      if (currentOffset > lastOffsetTop.current + 15) {
        lastOffsetTop.current = currentOffset;
        
        el.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      } else if (currentOffset < lastOffsetTop.current - 15) {
        // Handle jumping back (backspacing to previous line)
        lastOffsetTop.current = currentOffset;
        el.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }
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
        const isCurrent = index === snapshot.currentWordIndex;
        const isCompleted = index < snapshot.currentWordIndex;
        const isUpcoming = index > snapshot.currentWordIndex;
        
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

        if (isCompleted) {
          const isPerfect = state ? normalizeForCompare(state.typed) === normalizeForCompare(token.word + token.separator) : true;
          if (isPerfect) {
            return (
              <span key={token.id} className="text-[var(--success)]" style={{ opacity }}>
                {token.word + token.separator}
              </span>
            );
          }
          // If the word was imperfect, we render the detailed view so the user can see exactly where the errors were.
          return (
            <span key={token.id} className="transition-opacity duration-300" style={{ opacity }}>
              {renderWord(token.word + token.separator, state?.typed ?? "", false, true, false)}
            </span>
          );
        }

        if (isUpcoming) {
          return (
            <span key={token.id} className="text-[var(--text-muted)]" style={{ opacity }}>
              {token.word + token.separator}
            </span>
          );
        }

        return (
          <span key={token.id} ref={currentWordRef} className="transition-opacity duration-300" style={{ opacity }}>
            {renderWord(token.word + token.separator, state?.typed ?? "", true, state?.completed ?? false, state?.skipped ?? false)}
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
  let cursorIndex: number | null = current ? typedChars.length : null;

  // We loop ONLY through the expected characters to keep layout static.
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
      <span key={`char-${index}`} className={cn("relative", charClass)}>
        {index === cursorIndex && (
          <span className="absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] animate-pulse bg-[var(--accent)]" />
        )}
        {expectedChar}
      </span>
    );
  }

  // If the cursor is at the very end of the word (e.g. word fully typed but not yet advanced)
  if (cursorIndex === expectedChars.length) {
    output.push(
      <span key="cursor-end" className="relative">
        <span className="absolute -left-[0.5px] top-[10%] h-[80%] w-[2px] animate-pulse bg-[var(--accent)]" />
      </span>
    );
  }

  return output;
}
