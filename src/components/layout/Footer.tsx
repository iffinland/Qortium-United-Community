// ===== Footer Component =====

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageSquare, Heart, ExternalLink, Copy, Check, X, Coins, FolderKanban } from 'lucide-react';

const ExternalLinkButton = ({ href, label }: { href: string; label: string }) => {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    let success = false;

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(href);
        success = true;
      }
    } catch {
      // Clipboard API failed (common in iframes/Q-Apps), try fallback
    }

    if (!success) {
      try {
        // Fallback: create a textarea, select its content, and copy
        const ta = document.createElement('textarea');
        ta.value = href;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        ta.setAttribute('readonly', '');
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, href.length);
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // Even the fallback failed
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      // Last resort: select the text so the user can Ctrl+C manually
      const codeEl = document.getElementById(`extlink-${label}`);
      if (codeEl) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <>
      <button
        onClick={() => { setShowModal(true); setCopied(false); }}
        className="flex items-center gap-1.5 text-[var(--color-text-muted)] transition hover:text-cyan-600"
      >
        <ExternalLink className="h-3 w-3" /> {label}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface-card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</h3>
              <button onClick={() => setShowModal(false)} className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              External links cannot be opened directly in Q-Apps. Copy the URL below:
            </p>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-slate-50 p-3 dark:bg-slate-800">
              <code id={`extlink-${label}`} className="flex-1 break-all text-xs text-[var(--color-text-secondary)] select-all">{href}</code>
            </div>
            <div className="relative">
              <button
                onClick={handleCopy}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 ${
                  copied ? 'bg-emerald-600 shadow-lg shadow-emerald-500/30' : 'bg-cyan-600 hover:bg-cyan-700'
                }`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              {copied && (
                <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-lg animate-pulse">
                  ✓ Copied to clipboard!
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Footer = () => (
  <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-card)]">
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="grid gap-8 sm:grid-cols-3">
        {/* Brand */}
        <div>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-text-primary)]">
            Qortium United Community
          </h3>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            A community-driven platform built on Qortium blockchain technology.
            Learn, contribute, and grow together.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Quick Links
          </h3>
          <nav className="grid grid-cols-2 gap-1 text-xs">
            <Link to="/wiki" className="flex items-center gap-1.5 py-1 text-[var(--color-text-muted)] transition hover:text-cyan-600">
              <BookOpen className="h-3 w-3" /> Wiki
            </Link>
            <Link to="/forum" className="flex items-center gap-1.5 py-1 text-[var(--color-text-muted)] transition hover:text-cyan-600">
              <MessageSquare className="h-3 w-3" /> Forum
            </Link>
            <Link to="/support" className="flex items-center gap-1.5 py-1 text-[var(--color-text-muted)] transition hover:text-cyan-600">
              <Heart className="h-3 w-3" /> Support
            </Link>
            <Link to="/donations" className="flex items-center gap-1.5 py-1 text-[var(--color-text-muted)] transition hover:text-cyan-600">
              <Coins className="h-3 w-3" /> Donate
            </Link>
            <Link to="/projects" className="flex items-center gap-1.5 py-1 text-[var(--color-text-muted)] transition hover:text-cyan-600">
              <FolderKanban className="h-3 w-3" /> Projects
            </Link>
          </nav>
        </div>

        {/* External */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Qortium Project
          </h3>
          <div className="space-y-1.5 text-xs">
            <ExternalLinkButton href="https://qortium.app" label="qortium.app" />
            <ExternalLinkButton href="https://github.com/QortiumDev" label="GitHub" />
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-[var(--color-border-subtle)] pt-4 text-center text-[11px] text-[var(--color-text-muted)]">
        &copy; {new Date().getFullYear()} Qortium United Community. Built with ❤️ on Qortium Blockchain.
      </div>
    </div>
  </footer>
);

export default Footer;
