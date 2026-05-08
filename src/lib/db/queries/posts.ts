import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Post, NewPost } from '@/types';

export async function createPost(data: NewPost): Promise<Post> {
  const [created] = await db.insert(posts).values(data).returning();
  if (!created) throw new Error('Failed to create post');
  return created;
}

export async function getPost(id: string): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePost(
  id: string,
  patch: Partial<NewPost>,
): Promise<Post> {
  const [updated] = await db
    .update(posts)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(posts.id, id))
    .returning();
  if (!updated) throw new Error(`Post ${id} not found`);
  return updated;
}

export async function deletePost(id: string): Promise<void> {
  await db.delete(posts).where(eq(posts.id, id));
}
