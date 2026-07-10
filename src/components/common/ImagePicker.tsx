// ===== Image Picker Component =====
//
// Supports two modes:
//   1. Pick from computer → base64 preview (DEV: direct, PROD: publish to QDN)
//   2. QDN resource identifier → qdn://IMAGE/name/identifier

import { useState, useRef } from 'react';
import { Upload, Link, X, FileImage } from 'lucide-react';

type ImageSource = { type: 'file'; file: File; preview: string } | { type: 'qdn'; service: string; name: string; identifier: string } | null;

interface ImagePickerProps {
  value: ImageSource;
  onChange: (src: ImageSource) => void;
  label?: string;
}

const ImagePicker = ({ value, onChange, label = 'Cover Image' }: ImagePickerProps) => {
  const [mode, setMode] = useState<'file' | 'qdn'>('file');
  const [qdnService, setQdnService] = useState('IMAGE');
  const [qdnName, setQdnName] = useState('');
  const [qdnId, setQdnId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ type: 'file', file, preview: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleQdnSubmit = () => {
    if (!qdnName.trim() || !qdnId.trim()) return;
    onChange({ type: 'qdn', service: qdnService.trim(), name: qdnName.trim(), identifier: qdnId.trim() });
    setQdnName('');
    setQdnId('');
  };

  const clearImage = () => onChange(null);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[var(--color-text-muted)]">{label}</label>

      {/* Preview */}
      {value && (
        <div className="relative overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
          <img
            src={value.type === 'file' ? value.preview : `qdn://${value.service}/${value.name}/${value.identifier}`}
            alt="Preview"
            className="max-h-48 w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
          />
          <button
            onClick={clearImage}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mode toggle */}
      {!value && (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setMode('file')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
              mode === 'file' ? 'bg-white text-[var(--color-text-primary)] shadow-sm dark:bg-slate-700' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Upload className="h-3.5 w-3.5" /> From Computer
          </button>
          <button
            onClick={() => setMode('qdn')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
              mode === 'qdn' ? 'bg-white text-[var(--color-text-primary)] shadow-sm dark:bg-slate-700' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Link className="h-3.5 w-3.5" /> QDN Resource
          </button>
        </div>
      )}

      {/* File picker */}
      {!value && mode === 'file' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
            dragOver ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30' : 'border-[var(--color-border-subtle)] hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <FileImage className="mx-auto mb-1.5 h-8 w-8 text-[var(--color-text-muted)]" />
          <p className="text-xs text-[var(--color-text-muted)]">
            Click or drag an image here
          </p>
        </div>
      )}

      {/* QDN identifier input */}
      {!value && mode === 'qdn' && (
        <div className="space-y-2 rounded-lg border border-[var(--color-border-subtle)] p-3">
          <div className="flex gap-2">
            <input
              type="text" value={qdnService} onChange={(e) => setQdnService(e.target.value)}
              placeholder="Service"
              className="w-24 rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1.5 text-xs dark:bg-slate-900 dark:text-white"
            />
            <span className="self-center text-xs text-[var(--color-text-muted)]">/</span>
            <input
              type="text" value={qdnName} onChange={(e) => setQdnName(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1.5 text-xs dark:bg-slate-900 dark:text-white"
            />
            <span className="self-center text-xs text-[var(--color-text-muted)]">/</span>
            <input
              type="text" value={qdnId} onChange={(e) => setQdnId(e.target.value)}
              placeholder="Identifier"
              className="flex-1 rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1.5 text-xs dark:bg-slate-900 dark:text-white"
            />
          </div>
          <button
            onClick={handleQdnSubmit}
            disabled={!qdnName.trim() || !qdnId.trim()}
            className="w-full rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-700 disabled:opacity-50"
          >
            Set QDN Image
          </button>
        </div>
      )}
    </div>
  );
};

export default ImagePicker;
