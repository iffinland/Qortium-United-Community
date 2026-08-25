// ===== Wiki Types =====

// ---- Categories ----

export interface WikiCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
}

// ---- Entity Status ----

export type WikiArticleStatus = 'active' | 'archived';

// ---- Canonical Article View (from QDN validated resource) ----

export interface WikiArticleView {
  entityId: string;
  identifier: string;
  categoryId: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  tags: string[];
  publisherName: string;
  publisherAddress: string;
  createdAt: string | null;
  updatedAt: string | null;
  revision: number;
  status: WikiArticleStatus;
}

// ---- List Result ----

export type WikiListStatus = 'complete' | 'incomplete' | 'empty' | 'unavailable';

export interface WikiListResult {
  status: WikiListStatus;
  articles: WikiArticleView[];
  diagnostics: string[];
}

// ---- Detail Result ----

export type WikiDetailStatus = 'available' | 'not-found' | 'unavailable' | 'malformed' | 'archived';

export interface WikiDetailResult {
  status: WikiDetailStatus;
  article: WikiArticleView | null;
  diagnostics: string[];
}

// ---- Create Input ----

export interface CreateWikiArticleInput {
  categoryId: string;
  title: string;
  content: string;
}

// ---- Update Input ----

export interface UpdateWikiArticleInput {
  entityId: string;
  expectedRevision: number;
  categoryId: string;
  title: string;
  content: string;
}

// ---- Save Result ----

export interface WikiSaveResult {
  article: WikiArticleView;
}

// ---- Archive Result ----

export interface WikiArchiveResult {
  article: WikiArticleView;
}

// ---- Legacy (kept for backward-compat in types index only) ----

/** @deprecated Use WikiArticleView instead */
export interface WikiArticle {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  content: string;
  authorName: string;
  updatedAt: string;
  createdAt: string;
}
