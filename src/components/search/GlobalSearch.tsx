// ===== Application-Wide Global Search Input =====

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppSelector } from '../../store';
import {
  searchGlobalContent,
  type GlobalSearchResult,
  type SearchDomain,
} from '../../services/search/globalSearch';
import {
  normalizeSearchTerm,
  splitHighlightedSegments,
  type HighlightSegment,
} from '../../services/search/searchMatching';

const DOMAIN_LABELS: Record<SearchDomain, string> = {
  post: 'Post',
  'forum-topic': 'Forum topic',
  'forum-reply': 'Forum reply',
  project: 'Project',
  poll: 'Poll',
  wiki: 'Wiki',
  event: 'Event',
  'support-ticket': 'Support',
};

function HighlightedText({ text, term }: { text: string; term: string }) {
  const normalizedTerm = normalizeSearchTerm(term);
  const segments: HighlightSegment[] = splitHighlightedSegments(text, normalizedTerm);

  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark
            key={index}
            className="rounded bg-[var(--color-accent)]/30 px-0.5 text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [degradedDomains, setDegradedDomains] = useState<SearchDomain[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);
  const navigate = useNavigate();
  const auth = useAppSelector((state) => state.auth);

  useEffect(() => {
    const normalized = normalizeSearchTerm(query);
    if (!normalized) {
      requestId.current += 1;
      return;
    }

    const currentRequest = ++requestId.current;

    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void searchGlobalContent(normalized, {
        isAuthenticated: auth.isAuthenticated,
        currentAddress: auth.address,
        role: auth.role,
      })
        .then((response) => {
          if (currentRequest !== requestId.current) return;
          setResults(response.results);
          setDegraded(response.degraded);
          setDegradedDomains(response.degradedDomains);
          setIsLoading(false);
        })
        .catch(() => {
          if (currentRequest !== requestId.current) return;
          setResults([]);
          setDegraded(true);
          setDegradedDomains([]);
          setIsLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, auth.isAuthenticated, auth.address, auth.role]);

  const handleSelect = (result: GlobalSearchResult) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setDegraded(false);
    setDegradedDomains([]);
    navigate(result.href);
  };

  const degradedLabels = degradedDomains
    .map((domain) => DOMAIN_LABELS[domain])
    .join(', ');

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          setIsOpen(true);
          if (!normalizeSearchTerm(nextValue)) {
            requestId.current += 1;
            setResults([]);
            setDegraded(false);
            setDegradedDomains([]);
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // Delay close so a result click can register.
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        placeholder="Search community..."
        className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-[var(--color-text-muted)] transition focus:border-cyan-400/50 focus:bg-white/10 focus:outline-none"
      />

      {isOpen && query.trim() && (
        <div
          className="absolute right-0 top-full z-[70] mt-1 w-80 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-2 text-[var(--color-text-primary)] shadow-xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          {isLoading ? (
            <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
              Searching...
            </p>
          ) : results.length === 0 && !degraded ? (
            <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
              No matching community content.
            </p>
          ) : results.length === 0 && degraded ? (
            <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
              Search incomplete — some community areas couldn't be searched
              {degradedLabels ? ` (${degradedLabels})` : ''}.
            </p>
          ) : (
            <div className="space-y-1">
              {degraded && (
                <p className="px-2 py-1 text-[11px] text-[var(--color-text-muted)]">
                  Partial results — some community areas couldn't be searched
                  {degradedLabels ? ` (${degradedLabels})` : ''}.
                </p>
              )}
              {results.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  onClick={() => handleSelect(result)}
                  className="flex w-full flex-col rounded-lg px-2 py-2 text-left transition hover:bg-[var(--color-surface-muted)]"
                >
                  <span className="mb-0.5 flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      {DOMAIN_LABELS[result.domain]}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    <HighlightedText text={result.title} term={query} />
                  </span>
                  {result.body && (
                    <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      <HighlightedText text={result.body} term={query} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
