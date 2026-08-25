// ===== Global Search Matching Primitives =====
//
// Pure, DOM-safe helpers shared by the application-wide search service and UI.
// Highlight rendering is performed by splitting text into React segments,
// never by injecting user- or data-controlled HTML.

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/** Normalize a search term for case-insensitive matching. */
export function normalizeSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Return true when the normalized term is non-empty and text contains it. */
export function includesSearchTerm(text: string, normalizedTerm: string): boolean {
  return normalizedTerm.length > 0 && text.toLocaleLowerCase().includes(normalizedTerm);
}

/**
 * Split text into matched/unmatched segments for safe React rendering.
 * Overlapping matches are not required because a single non-empty literal term
 * is searched. Empty terms produce one unmatched segment.
 */
export function splitHighlightedSegments(
  text: string,
  normalizedTerm: string,
): HighlightSegment[] {
  if (!normalizedTerm || !text) {
    return text ? [{ text, matched: false }] : [];
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerTerm = normalizedTerm;
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerTerm, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), matched: false });
      break;
    }

    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), matched: false });
    }

    segments.push({
      text: text.slice(index, index + lowerTerm.length),
      matched: true,
    });
    cursor = index + lowerTerm.length;
  }

  return segments;
}

/**
 * Score a candidate so direct title/name matches rank above body matches.
 * Higher is better. Partial body matches still produce a positive score.
 */
export function scoreSearchCandidate(
  title: string,
  body: string,
  normalizedTerm: string,
): number {
  if (!normalizedTerm) return 0;
  const titleNorm = title.toLocaleLowerCase();
  const bodyNorm = body.toLocaleLowerCase();
  let score = 0;

  if (titleNorm === normalizedTerm) score += 100;
  else if (titleNorm.startsWith(normalizedTerm)) score += 80;
  else if (titleNorm.includes(normalizedTerm)) score += 60;

  if (bodyNorm.startsWith(normalizedTerm)) score += 40;
  else if (bodyNorm.includes(normalizedTerm)) score += 20;

  return score;
}
