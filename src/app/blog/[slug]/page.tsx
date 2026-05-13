import { getBlogPostBySlug } from '@/lib/db/queries/site-content';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <Link href="/blog" className="text-sm text-muted-foreground hover:underline mb-6 inline-block">
        &larr; Blog
      </Link>
      <article>
        {post.cover_url && (
          <img src={post.cover_url} alt={post.title} className="w-full rounded-lg mb-8 max-h-96 object-cover" />
        )}
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
          {post.published_at && (
            <time>{new Date(post.published_at).toLocaleDateString('de-DE')}</time>
          )}
          {(post.tags as unknown[]).filter((t): t is string => typeof t === 'string').map((tag) => (
            <span key={tag} className="bg-secondary px-2 py-0.5 rounded-full text-xs">#{tag}</span>
          ))}
        </div>
        {post.body && (
          <div className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
            {post.body}
          </div>
        )}
      </article>
    </main>
  );
}
