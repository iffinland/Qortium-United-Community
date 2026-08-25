// ===== Markdown Renderer =====
//
// Converts basic Markdown to safe React elements.
// Supports: **bold**, *italic*, `code`, [links](url),
// # headings, - lists, and paragraphs.
// All content is rendered as React elements — no raw HTML insertion.
// Link hrefs are sanitized against unsafe protocols.

import { type ReactNode } from 'react';

/** Unsafe URL protocols blocked from link rendering. */
const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i;

/** Returns true if the href uses a safe protocol. */
function isSafeHref(href: string): boolean {
  return !BLOCKED_PROTOCOLS.test(href.trim());
}

type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string };

type Block =
  | { type: 'heading'; level: number; tokens: InlineToken[] }
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'list'; items: InlineToken[][] };

const parseInline = (text: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  let remaining = text;

  while (remaining) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    const codeMatch = remaining.match(/^`(.+?)`/);
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);

    const matches = [
      { match: boldMatch, type: 'bold' as const, idx: boldMatch?.index ?? Infinity },
      { match: italicMatch, type: 'italic' as const, idx: italicMatch?.index ?? Infinity },
      { match: codeMatch, type: 'code' as const, idx: codeMatch?.index ?? Infinity },
      { match: linkMatch, type: 'link' as const, idx: linkMatch?.index ?? Infinity },
    ];

    const earliest = matches.reduce((best, m) =>
      m.idx < best.idx ? m : best
    );

    if (!earliest.match || earliest.idx === Infinity) {
      tokens.push({ type: 'text', value: remaining });
      break;
    }

    if (earliest.idx > 0) {
      tokens.push({ type: 'text', value: remaining.slice(0, earliest.idx) });
    }

    const m = earliest.match!;
    if (earliest.type === 'bold') {
      tokens.push({ type: 'bold', value: m[1] });
    } else if (earliest.type === 'italic') {
      tokens.push({ type: 'italic', value: m[1] });
    } else if (earliest.type === 'code') {
      tokens.push({ type: 'code', value: m[1] });
    } else if (earliest.type === 'link') {
      tokens.push({ type: 'link', value: m[1], href: m[2] });
    }

    remaining = remaining.slice(earliest.idx + m[0].length);
  }

  return tokens;
};

const parseBlocks = (content: string): Block[] => {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        tokens: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*]\s+/, '')));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      tokens: parseInline(paraLines.join(' ')),
    });
  }

  return blocks;
};

const renderInlineToken = (token: InlineToken, key: number): ReactNode => {
  switch (token.type) {
    case 'text':
      return token.value;
    case 'bold':
      return <strong key={key}>{token.value}</strong>;
    case 'italic':
      return <em key={key}>{token.value}</em>;
    case 'code':
      return (
        <code
          key={key}
          className="rounded bg-[var(--color-surface-muted)] px-1 py-0.5 text-[0.85em] text-rose-400"
        >
          {token.value}
        </code>
      );
    case 'link':
      return isSafeHref(token.href) ? (
        <a
          key={key}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-600 underline hover:text-cyan-300"
        >
          {token.value}
        </a>
      ) : (
        <span key={key} className="text-slate-400 line-through">{token.value}</span>
      );
  }
};

const renderBlock = (block: Block, key: number): ReactNode => {
  switch (block.type) {
    case 'heading': {
      const cls = 'mb-3 font-semibold text-[var(--color-text-primary)]';
      const children = block.tokens.map((t, i) => renderInlineToken(t, i));
      if (block.level <= 1) return <h2 key={key} className={cls}>{children}</h2>;
      if (block.level === 2) return <h3 key={key} className={cls}>{children}</h3>;
      return <h4 key={key} className={cls}>{children}</h4>;
    }
    case 'paragraph':
      return (
        <p key={key} className="mb-3 leading-relaxed text-[var(--color-text-secondary)]">
          {block.tokens.map((t, i) => renderInlineToken(t, i))}
        </p>
      );
    case 'list':
      return (
        <ul key={key} className="mb-3 list-disc pl-5 text-[var(--color-text-secondary)]">
          {block.items.map((item, i) => (
            <li key={i} className="mb-1">
              {item.map((t, j) => renderInlineToken(t, j))}
            </li>
          ))}
        </ul>
      );
  }
};

export const parseMarkdown = (content: string): ReactNode[] => {
  const blocks = parseBlocks(content);
  return blocks.map((block, i) => renderBlock(block, i));
};
