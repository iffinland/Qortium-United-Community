// ===== Rich Text Editor Component =====
//
// Markdown-aware editor with formatting toolbar.
// Supports: bold, italic, code, link, heading, list, image.

import { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Code,
  Link,
  Heading1,
  List,
  Eye,
  Edit3,
} from 'lucide-react';
import { parseMarkdown } from '../../services/forum/markdown';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  label?: string;
}

type Tool =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'heading'
  | 'list'
  | 'image';

const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Write something...',
  minRows = 6,
  label,
}: RichTextEditorProps) => {
  const [isPreview, setIsPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = (tool: Tool) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    let insertion = '';

    switch (tool) {
      case 'bold':
        insertion = selected ? `**${selected}**` : '**bold text**';
        break;
      case 'italic':
        insertion = selected ? `*${selected}*` : '*italic text*';
        break;
      case 'code':
        insertion = selected ? `\`${selected}\`` : '`code`';
        break;
      case 'link':
        insertion = selected
          ? `[${selected}](url)`
          : '[link text](https://)';
        break;
      case 'heading':
        insertion = selected
          ? `\n## ${selected}\n`
          : '\n## Heading\n';
        break;
      case 'list':
        insertion = selected
          ? selected
              .split('\n')
              .map((l) => `- ${l}`)
              .join('\n')
          : '\n- item 1\n- item 2\n';
        break;
      case 'image':
        insertion = selected
          ? `![${selected}](url)`
          : '![alt text](image-url)';
        break;
    }

    const before = value.slice(0, start);
    const after = value.slice(end);
    const newValue = before + insertion + after;
    onChange(newValue);

    // Restore cursor position
    const cursorPos = start + insertion.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  };

  const tools: { id: Tool; icon: typeof Bold; label: string }[] = [
    { id: 'bold', icon: Bold, label: 'Bold' },
    { id: 'italic', icon: Italic, label: 'Italic' },
    { id: 'code', icon: Code, label: 'Code' },
    { id: 'link', icon: Link, label: 'Link' },
    { id: 'heading', icon: Heading1, label: 'Heading' },
    { id: 'list', icon: List, label: 'List' },
  ];

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-[var(--color-border-subtle)] bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => insertFormatting(tool.id)}
            className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-200 hover:text-[var(--color-text-primary)] dark:hover:bg-slate-700"
            title={tool.label}
          >
            <tool.icon className="h-4 w-4" />
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setIsPreview(!isPreview)}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
            isPreview
              ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          {isPreview ? (
            <>
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Preview
            </>
          )}
        </button>
      </div>

      {/* Editor / Preview */}
      {isPreview ? (
        <div className="min-h-[10rem] rounded-b-lg border border-[var(--color-border-subtle)] bg-white p-3 dark:bg-slate-900">
          {value.trim() ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {parseMarkdown(value)}
            </div>
          ) : (
            <p className="text-sm italic text-[var(--color-text-muted)]">
              Nothing to preview yet...
            </p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          className="w-full resize-y rounded-b-lg border border-[var(--color-border-subtle)] bg-white p-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 dark:bg-slate-900 dark:text-white"
        />
      )}
    </div>
  );
};

export default RichTextEditor;
