// ===== Wiki Types =====

export interface WikiCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  sortOrder: number;
}

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
