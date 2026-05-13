import { getPublishedBlogPosts } from '@/lib/db/queries/site-content';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-2">Blog</h1>
      <p className="text-muted-foreground mb-10">Fly & Froth Design Studio</p>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">Henuz blog yazisi yok.</p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post.id} className="border-b pb-6">
              <Link href={`/blog/${post.slug}`} className="group">
                <h2 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
              </Link>
              {post.excerpt && (
                <p className="text-muted-foreground mt-2">{post.excerpt}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {post.published_at && (
                  <time>{new Date(post.published_at).toLocaleDateString('de-DE')}</time>
                )}
                {(post.tags as unknown[]).filter((t): t is string => typeof t === 'string').map((tag) => (
                  <span key={tag} className="bg-secondary px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
