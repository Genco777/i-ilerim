import { db } from '@/lib/db';
import { siteContent, portfolioItems, blogPosts } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

// ───── Site Content (editable page sections) ─────

export async function getSiteSection(section: string) {
  const rows = await db.select().from(siteContent).where(eq(siteContent.section, section)).limit(1);
  return rows[0] ?? null;
}

export async function getAllSiteContent() {
  return db.select().from(siteContent).orderBy(siteContent.section);
}

export async function upsertSiteSection(section: string, data: { title?: string; body?: string; meta?: Record<string, unknown> }) {
  await db
    .insert(siteContent)
    .values({
      section,
      title: data.title ?? null,
      body: data.body ?? null,
      meta: data.meta ?? {},
    })
    .onConflictDoUpdate({
      target: siteContent.section,
      set: {
        title: data.title ?? null,
        body: data.body ?? null,
        meta: data.meta ?? {},
        updated_at: new Date(),
      },
    });
}

// ───── Portfolio ─────

export async function getPublishedPortfolio() {
  return db
    .select()
    .from(portfolioItems)
    .where(eq(portfolioItems.is_published, 1))
    .orderBy(portfolioItems.sort_order);
}

export async function getAllPortfolioItems() {
  return db.select().from(portfolioItems).orderBy(desc(portfolioItems.created_at));
}

export async function addPortfolioItem(data: {
  title: string;
  description?: string;
  image_url?: string;
  category?: string;
  sort_order?: number;
}) {
  const [row] = await db.insert(portfolioItems).values({
    title: data.title,
    description: data.description ?? null,
    image_url: data.image_url ?? null,
    category: data.category ?? null,
    sort_order: data.sort_order ?? 0,
  }).returning();
  return row;
}

export async function updatePortfolioItem(id: string, data: Partial<{
  title: string;
  description: string;
  image_url: string;
  category: string;
  sort_order: number;
  is_published: number;
}>) {
  await db.update(portfolioItems).set(data).where(eq(portfolioItems.id, id));
}

export async function deletePortfolioItem(id: string) {
  await db.delete(portfolioItems).where(eq(portfolioItems.id, id));
}

// ───── Blog ─────

export async function getPublishedBlogPosts() {
  return db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.is_published, 1))
    .orderBy(desc(blogPosts.published_at));
}

export async function getAllBlogPosts() {
  return db.select().from(blogPosts).orderBy(desc(blogPosts.created_at));
}

export async function getBlogPostBySlug(slug: string) {
  const rows = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, slug), eq(blogPosts.is_published, 1))).limit(1);
  return rows[0] ?? null;
}

export async function upsertBlogPost(data: {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  cover_url?: string;
  tags?: string[];
  is_published?: number;
}) {
  await db
    .insert(blogPosts)
    .values({
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt ?? null,
      body: data.body ?? null,
      cover_url: data.cover_url ?? null,
      tags: data.tags ?? [],
      is_published: data.is_published ?? 0,
      published_at: data.is_published ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: blogPosts.slug,
      set: {
        title: data.title,
        excerpt: data.excerpt ?? null,
        body: data.body ?? null,
        cover_url: data.cover_url ?? null,
        tags: data.tags ?? [],
        is_published: data.is_published ?? 0,
        published_at: data.is_published ? new Date() : null,
        updated_at: new Date(),
      },
    });
}

export async function deleteBlogPost(id: string) {
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}
