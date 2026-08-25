// ===== Rich Text Editor =====
//
// Lightweight BBCode-style editor adapted from the proven Qortium Blogs
// implementation. Images are published as standalone QDN resources when
// selected; parent content is published separately only when the enclosing
// form is submitted.

import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Palette,
  Quote,
  SmilePlus,
  Underline,
  X,
} from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  RICH_TEXT_FORMAT_TAGS,
  applyColorFormat,
  applyLinkFormat,
  applyListFormat,
  applyWrapFormat,
  encodeQdnImageTag,
  insertAtSelection,
  type RichTextFormat,
} from '../../services/rich-text/richText';
import { publishQdnImage } from '../../services/qdn/qdnImageService';

interface RichTextEditorProps {
  value: string;
  ownerName: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minRows?: number;
  label?: string;
}

const formatButtons: Array<{
  type: RichTextFormat;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}> = [
  { type: 'bold', label: 'Bold', shortLabel: 'B', icon: <Bold size={17} /> },
  { type: 'italic', label: 'Italic', shortLabel: 'I', icon: <Italic size={17} /> },
  { type: 'underline', label: 'Underline', shortLabel: 'U', icon: <Underline size={17} /> },
  { type: 'heading2', label: 'Heading', shortLabel: 'H2', icon: <Heading2 size={17} /> },
  { type: 'heading3', label: 'Subheading', shortLabel: 'H3', icon: <Heading3 size={17} /> },
  { type: 'quote', label: 'Quote', shortLabel: 'Quote', icon: <Quote size={17} /> },
  { type: 'code', label: 'Code', shortLabel: 'Code', icon: <Code size={17} /> },
  { type: 'link', label: 'Link', shortLabel: 'Link', icon: <LinkIcon size={17} /> },
];

const emojiOptions = ['🙂', '😀', '😁', '😂', '😍', '🔥', '👍', '🙏', '🎉', '💡', '⭐', '❤️'];

const colorOptions = [
  '#111827',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
];

export function RichTextEditor({
  value,
  ownerName,
  onChange,
  disabled = false,
  placeholder = 'Write something...',
  minRows = 5,
  label,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const linkUrlInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState('');
  const [isLinkPopupOpen, setIsLinkPopupOpen] = useState(false);
  const [isEmojiPopupOpen, setIsEmojiPopupOpen] = useState(false);
  const [isColorPopupOpen, setIsColorPopupOpen] = useState(false);
  const [customColor, setCustomColor] = useState(colorOptions[0]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [savedSelection, setSavedSelection] = useState({ selectionStart: 0, selectionEnd: 0 });
  const isUploadDisabled = disabled || !ownerName;

  const focusSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const applyResult = (result: {
    value: string;
    nextSelectionStart: number;
    nextSelectionEnd: number;
  }) => {
    onChange(result.value);
    focusSelection(result.nextSelectionStart, result.nextSelectionEnd);
  };

  const getSelection = () => ({
    selectionStart: textareaRef.current?.selectionStart ?? value.length,
    selectionEnd: textareaRef.current?.selectionEnd ?? value.length,
  });

  const openLinkPopup = () => {
    const selection = getSelection();
    const selectedText = value.slice(selection.selectionStart, selection.selectionEnd).trim();
    const selectedIsLink = selectedText.toLowerCase().startsWith('qdn://');
    setIsEmojiPopupOpen(false);
    setIsColorPopupOpen(false);
    setSavedSelection(selection);
    setLinkUrl(selectedIsLink ? selectedText : '');
    setLinkLabel(selectedIsLink ? '' : selectedText);
    setIsLinkPopupOpen(true);
    setStatus('');
    requestAnimationFrame(() => linkUrlInputRef.current?.focus());
  };

  const openEmojiPopup = () => {
    setSavedSelection(getSelection());
    setIsLinkPopupOpen(false);
    setIsColorPopupOpen(false);
    setIsEmojiPopupOpen((current) => !current);
    setStatus('');
  };

  const openColorPopup = () => {
    setSavedSelection(getSelection());
    setIsLinkPopupOpen(false);
    setIsEmojiPopupOpen(false);
    setIsColorPopupOpen((current) => !current);
    setStatus('');
  };

  const closeLinkPopup = () => {
    setIsLinkPopupOpen(false);
    focusSelection(savedSelection.selectionStart, savedSelection.selectionEnd);
  };

  const addLink = () => {
    if (!linkUrl.trim()) {
      setStatus('Add a QDN or web link first.');
      requestAnimationFrame(() => linkUrlInputRef.current?.focus());
      return;
    }

    applyResult(
      applyLinkFormat({
        value,
        ...savedSelection,
        url: linkUrl,
        label: linkLabel,
      }),
    );
    setIsLinkPopupOpen(false);
    setLinkUrl('');
    setLinkLabel('');
    setStatus('Link inserted.');
  };

  const insertEmoji = (emoji: string) => {
    applyResult(insertAtSelection({ value, ...savedSelection, snippet: emoji }));
    setIsEmojiPopupOpen(false);
  };

  const applyTextColor = (color: string) => {
    applyResult(applyColorFormat({ value, ...savedSelection, color }));
    setIsColorPopupOpen(false);
  };

  useEffect(() => {
    if (!isLinkPopupOpen && !isEmojiPopupOpen && !isColorPopupOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsLinkPopupOpen(false);
      setIsEmojiPopupOpen(false);
      setIsColorPopupOpen(false);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          savedSelection.selectionStart,
          savedSelection.selectionEnd,
        );
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isColorPopupOpen, isEmojiPopupOpen, isLinkPopupOpen, savedSelection]);

  const handleFormat = (format: RichTextFormat) => {
    if (format === 'link') {
      openLinkPopup();
      return;
    }

    const [openTag, closeTag] = RICH_TEXT_FORMAT_TAGS[format];
    applyResult(
      applyWrapFormat({
        value,
        ...getSelection(),
        openTag,
        closeTag,
        placeholder: 'text',
      }),
    );
  };

  const handleList = (ordered: boolean) => {
    applyResult(applyListFormat({ value, ...getSelection(), ordered }));
  };

  const insertSnippet = (snippet: string) => {
    const { selectionStart, selectionEnd } = getSelection();
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    const normalizedBefore = before.replace(/\n+$/, '');
    const normalizedAfter = after.replace(/^\n+/, '');
    const sepBefore = normalizedBefore ? '\n\n' : '';
    const sepAfter = normalizedAfter ? '\n\n' : '';
    const cleanSnippet = snippet.trim();
    const result = `${normalizedBefore}${sepBefore}${cleanSnippet}${sepAfter}${normalizedAfter}`;
    const nextPos = normalizedBefore.length + sepBefore.length + cleanSnippet.length + sepAfter.length;

    applyResult({ value: result, nextSelectionStart: nextPos, nextSelectionEnd: nextPos });
  };

  const uploadSelectedImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isUploadDisabled) return;

    try {
      setStatus('Uploading image to QDN...');
      const ref = await publishQdnImage(file, ownerName);
      insertSnippet(encodeQdnImageTag(ref));
      setStatus(`${file.name} inserted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to upload image.');
    }
  };

  return (
    <div className="relative space-y-1">
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)]/50 px-2 py-1.5">
        {formatButtons.map((button) => (
          <button
            key={button.type}
            type="button"
            className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)]"
            title={button.label}
            aria-label={button.label}
            onMouseDown={(event) => {
              event.preventDefault();
              handleFormat(button.type);
            }}
            disabled={disabled}
          >
            {button.icon}
          </button>
        ))}

        {isLinkPopupOpen ? (
          <div className="absolute z-20 mt-2 w-72 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">Add link</span>
              <button type="button" onClick={closeLinkPopup} aria-label="Close link editor">
                <X size={16} />
              </button>
            </div>
            <label className="mb-2 block text-xs text-[var(--color-text-muted)]">
              Link
              <input
                ref={linkUrlInputRef}
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="qdn://DOCUMENT/name/identifier or https://..."
                className="mt-1 w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="mb-2 block text-xs text-[var(--color-text-muted)]">
              Label
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Optional label"
                className="mt-1 w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-xs text-white"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeLinkPopup} className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)]">
                Cancel
              </button>
              <button type="button" onClick={addLink} className="rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white">
                Add
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)]"
          title="Insert emoji"
          aria-label="Insert emoji"
          onMouseDown={(event) => {
            event.preventDefault();
            openEmojiPopup();
          }}
          disabled={disabled}
        >
          <SmilePlus size={17} />
        </button>

        {isEmojiPopupOpen ? (
          <div className="absolute z-20 mt-2 w-48 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-xl">
            <div className="grid grid-cols-6 gap-1">
              {emojiOptions.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className="rounded p-1 text-lg hover:bg-slate-700"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertEmoji(emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)]"
          title="Text color"
          aria-label="Text color"
          onMouseDown={(event) => {
            event.preventDefault();
            openColorPopup();
          }}
          disabled={disabled}
        >
          <Palette size={17} />
        </button>

        {isColorPopupOpen ? (
          <div className="absolute z-20 mt-2 w-48 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-xl">
            <div className="grid grid-cols-4 gap-1">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  key={color}
                  className="h-6 w-6 rounded-full border border-white/20"
                  style={{ backgroundColor: color }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyTextColor(color);
                  }}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
            <label className="mt-2 block text-xs text-[var(--color-text-muted)]">
              Custom
              <input
                type="color"
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <button
              type="button"
              className="mt-2 w-full rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white"
              onMouseDown={(event) => {
                event.preventDefault();
                applyTextColor(customColor);
              }}
            >
              Apply
            </button>
          </div>
        ) : null}

        <span className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)]"
          title="Bulleted list"
          aria-label="Bulleted list"
          onMouseDown={(event) => {
            event.preventDefault();
            handleList(false);
          }}
          disabled={disabled}
        >
          <List size={17} />
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)]"
          title="Numbered list"
          aria-label="Numbered list"
          onMouseDown={(event) => {
            event.preventDefault();
            handleList(true);
          }}
          disabled={disabled}
        >
          <ListOrdered size={17} />
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />

        <button
          type="button"
          className="rounded p-1.5 text-[var(--color-text-muted)] transition hover:bg-slate-700 hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Upload image"
          aria-label="Upload image"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploadDisabled}
        >
          <ImagePlus size={17} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="w-full resize-y rounded-b-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={minRows}
        disabled={disabled}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => void uploadSelectedImage(event)}
      />

      {status ? <div className="text-xs text-[var(--color-text-muted)]">{status}</div> : null}
    </div>
  );
}
