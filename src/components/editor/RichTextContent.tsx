// ===== Rich Text Content Renderer =====
//
// Renders canonical QUC rich-text markers safely (no raw HTML). For content
// published before this system existed, it falls back to the legacy Markdown
// renderer so existing resources remain readable.

import { useMemo, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { QdnImageRef } from '../../types';
import {
  autolinkText,
  getSafeLinkHref,
  hasRichTextMarkup,
  type TextSegment,
} from '../../services/rich-text/richText';
import { parseMarkdown } from '../../services/forum/markdown';
import { useQdnImageUrl } from '../../hooks/useQdnImageUrl';
import { openQdnUrl } from '../../services/qortium/qdnNavigation';
import { requestQortium } from '../../services/qortium/qortiumClient';

type RichTextContentProps = {
  value: string;
};

// ---- Link handling ----

type LinkKind = 'internal-nav' | 'web' | 'local' | 'blocked';

const classifyLinkHref = (href: string): LinkKind => {
  const lower = href.toLowerCase();
  if (lower.startsWith('qdn://') || lower.startsWith('home://') || lower.startsWith('core://')) {
    return 'internal-nav';
  }
  if (lower.startsWith('https://') || lower.startsWith('http://')) return 'web';
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) return 'local';
  return 'blocked';
};

const openInternalLink = async (address: string) => {
  try {
    if (address.toLowerCase().startsWith('qdn://')) {
      await openQdnUrl(address);
      return;
    }
    await requestQortium({ action: 'OPEN_NEW_TAB', address });
  } catch {
    window.open(address, '_blank');
  }
};

function RichLink({ href, children }: { href: string; children: ReactNode }) {
  const kind = classifyLinkHref(href);

  if (kind === 'blocked') return <span>{children}</span>;

  if (kind === 'local') {
    return <RouterLink to={href}>{children}</RouterLink>;
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        if (kind === 'internal-nav') {
          event.preventDefault();
          void openInternalLink(href);
        } else {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      {children}
    </a>
  );
}

// ---- Text line splitting ----

const splitTextLines = (value: string, keyPrefix: string): ReactNode[] =>
  value.split(/\r?\n/).flatMap((line, index, lines) => {
    const displayLine = /^\s*-\s+/.test(line)
      ? line.replace(/^\s*-\s+/, '• ')
      : /^\s*\d+\.\s+/.test(line)
        ? line.trim()
        : line;
    const nodes: ReactNode[] = [<span key={`${keyPrefix}-${index}`}>{displayLine}</span>];
    if (index < lines.length - 1) nodes.push(<br key={`${keyPrefix}-${index}-br`} />);
    return nodes;
  });

const renderTextSegments = (segments: TextSegment[], keyPrefix: string): ReactNode[] =>
  segments.flatMap((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    if (segment.kind === 'link') {
      const href = getSafeLinkHref(segment.href);
      if (!href) return splitTextLines(segment.value, key);
      return (
        <RichLink key={key} href={href}>
          {segment.value}
        </RichLink>
      );
    }
    return splitTextLines(segment.value, key);
  });

// ---- Tokenizer / renderer ----

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'wrap'; tag: string; value: string; param?: string }
  | { kind: 'image'; value: string };

const tokenPattern =
  /\[(b|i|u|h2|h3|quote|code)\]([\s\S]*?)\[\/\1\]|\[color=(#[0-9a-f]{6})\]([\s\S]*?)\[\/color\]|\[url=([^\]]+)\]([\s\S]*?)\[\/url\]|\[imageqdn\]([\s\S]*?)\[\/imageqdn\]/gi;

const decodeTagValue = (value: string | undefined) => {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
};

const parseImageRef = (payload: string): QdnImageRef => {
  const [name, identifier, filename, mimeType, size] = payload.split('|').map(decodeTagValue);
  return {
    service: 'IMAGE',
    name,
    identifier,
    filename: filename || undefined,
    mimeType: mimeType || undefined,
    size: Number.isFinite(Number(size)) ? Number(size) : undefined,
  };
};

const tokenize = (value: string): Token[] => {
  const tokens: Token[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  tokenPattern.lastIndex = 0;

  while ((match = tokenPattern.exec(value))) {
    if (match.index > cursor) {
      tokens.push({ kind: 'text', value: value.slice(cursor, match.index) });
    }

    if (match[1]) {
      tokens.push({ kind: 'wrap', tag: match[1].toLowerCase(), value: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: 'wrap', tag: 'color', param: match[3], value: match[4] });
    } else if (match[5]) {
      tokens.push({ kind: 'wrap', tag: 'url', param: match[5], value: match[6] });
    } else if (match[7]) {
      tokens.push({ kind: 'image', value: match[7] });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    tokens.push({ kind: 'text', value: value.slice(cursor) });
  }

  return tokens;
};

function RichImage({ refData }: { refData: QdnImageRef }) {
  const { url, handleError } = useQdnImageUrl(refData);

  if (!url) {
    return <div className="rich-image-placeholder">{refData.filename || refData.identifier}</div>;
  }

  return (
    <img
      src={url}
      alt={refData.filename || refData.identifier}
      className="rich-image"
      onError={handleError}
    />
  );
}

const renderTokens = (tokens: Token[], keyPrefix: string): ReactNode[] =>
  tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.kind === 'text') return renderTextSegments(autolinkText(token.value), key);
    if (token.kind === 'image') {
      return <RichImage key={key} refData={parseImageRef(token.value)} />;
    }

    const children = renderTokens(tokenize(token.value), key);
    if (token.tag === 'b') return <strong key={key}>{children}</strong>;
    if (token.tag === 'i') return <em key={key}>{children}</em>;
    if (token.tag === 'u') return <u key={key}>{children}</u>;
    if (token.tag === 'h2') return <h2 key={key}>{children}</h2>;
    if (token.tag === 'h3') return <h3 key={key}>{children}</h3>;
    if (token.tag === 'quote') return <blockquote key={key}>{children}</blockquote>;
    if (token.tag === 'code') return <code key={key}>{token.value}</code>;
    if (token.tag === 'color') {
      const color = /^#[0-9a-f]{6}$/i.test(token.param ?? '') ? token.param : undefined;
      return (
        <span key={key} style={color ? { color } : undefined}>
          {children}
        </span>
      );
    }
    if (token.tag === 'url') {
      const href = getSafeLinkHref(token.param);
      if (!href) return <span key={key}>{children}</span>;
      return (
        <RichLink key={key} href={href}>
          {children}
        </RichLink>
      );
    }
    return children;
  });

export function RichTextContent({ value }: RichTextContentProps) {
  const rendered = useMemo(() => {
    if (!value) return null;
    if (hasRichTextMarkup(value)) {
      return <div className="rich-content">{renderTokens(tokenize(value), 'root')}</div>;
    }
    return <div className="rich-content legacy-markdown">{parseMarkdown(value)}</div>;
  }, [value]);

  return rendered;
}
