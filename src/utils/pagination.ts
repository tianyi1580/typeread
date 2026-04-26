import type { TokenizedWord } from "../types";

export interface PageRange {
  start: number;
  end: number;
}

function resolveWrappedLineState(charsInLine: number, charsPerLine: number) {
  if (charsInLine <= charsPerLine) {
    return {
      additionalLines: 0,
      charsOnLastLine: charsInLine,
    };
  }

  const totalLines = Math.ceil(charsInLine / charsPerLine);
  const remainder = charsInLine % charsPerLine;

  return {
    additionalLines: totalLines - 1,
    // Preserve an exact-fit line as "full" so the next appended chars still force a wrap.
    charsOnLastLine: remainder === 0 ? charsPerLine : remainder,
  };
}

/**
 * Splits text into pages based on the available vertical space (maxLines).
 * It simulates word-wrapping to estimate how many lines each token will occupy.
 * This ensures that Page 2 resumes exactly where Page 1's visible content ended.
 */
export function paginateText(
  text: string, 
  maxLines: number,
  charsPerLine: number,
  tokens: TokenizedWord[]
): PageRange[] {
  if (tokens.length === 0) {
    return [{ start: 0, end: text.length }];
  }

  // Sanity check for inputs
  // We use a slightly more conservative charsPerLine internally to account for 
  // proportional font variance and potential browser wrapping differences.
  const safeMaxLines = Math.max(2, maxLines);
  const safeCharsPerLine = Math.max(10, charsPerLine);

  const ranges: PageRange[] = [];
  let currentTokenIndex = 0;
  let cursor = 0;

  while (currentTokenIndex < tokens.length) {
    if (maxLines <= 0 || charsPerLine <= 0) {
      // Safety break for invalid layout parameters
      ranges.push({ start: cursor, end: text.length });
      break;
    }
    const rangeStart = cursor;
    let linesUsed = 1; // Start with the first line
    let currentLineChars = 0;
    let bestBreakIndex = currentTokenIndex;

    for (let i = currentTokenIndex; i < tokens.length; i++) {
      const token = tokens[i];
      const wordLength = token.word.length;
      
      // 1. Simulate word wrapping
      // If adding this word exceeds the line width, it moves to a new line
      if (currentLineChars + wordLength > safeCharsPerLine && currentLineChars > 0) {
        linesUsed++;
        currentLineChars = wordLength;
      } else {
        currentLineChars += wordLength;
      }

      // Handle words longer than a single line (rare but possible)
      if (currentLineChars > safeCharsPerLine) {
        const overflow = resolveWrappedLineState(currentLineChars, safeCharsPerLine);
        linesUsed += overflow.additionalLines;
        currentLineChars = overflow.charsOnLastLine;
      }

      // 2. Check if we've exceeded the page capacity BEFORE adding the separator
      // This is more conservative and prevents the last word of a page from being cut off
      if (linesUsed > safeMaxLines) {
        break;
      }

      // 3. Handle the separator (spaces or newlines)
      if (token.separator.includes("\n")) {
        const parts = token.separator.split("\n");
        const newlineCount = parts.length - 1;
        linesUsed += newlineCount;
        // The characters after the last newline start the new line
        currentLineChars = parts[parts.length - 1].length;
      } else {
        currentLineChars += token.separator.length;
        if (currentLineChars > safeCharsPerLine) {
          const overflow = resolveWrappedLineState(currentLineChars, safeCharsPerLine);
          linesUsed += overflow.additionalLines;
          currentLineChars = overflow.charsOnLastLine;
        }
      }

      // Check again after separator
      if (linesUsed > safeMaxLines) {
        // If the separator pushed us over, we stop BEFORE this word to ensure 
        // the next page starts with this word and its potentially layout-critical separator.
        break;
      }
      
      bestBreakIndex = i;
    }

    const endToken = tokens[bestBreakIndex];
    ranges.push({ start: rangeStart, end: endToken.end });
    
    cursor = endToken.end;
    currentTokenIndex = bestBreakIndex + 1;
  }

  // Ensure the last range covers any trailing content
  if (ranges.length > 0 && ranges[ranges.length - 1].end < text.length) {
    ranges[ranges.length - 1].end = text.length;
  }

  return ranges;
}
