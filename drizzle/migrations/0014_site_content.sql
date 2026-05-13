CREATE TABLE "site_content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "section" text NOT NULL UNIQUE,
  "title" text,
  "body" text,
  "meta" jsonb DEFAULT '{}',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "portfolio_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "category" text,
  "sort_order" integer DEFAULT 0,
  "is_published" integer DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "pf_published_idx" ON "portfolio_items" ("is_published");
CREATE INDEX "pf_sort_idx" ON "portfolio_items" ("sort_order");

CREATE TABLE "blog_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "excerpt" text,
  "body" text,
  "cover_url" text,
  "tags" jsonb DEFAULT '[]',
  "is_published" integer DEFAULT 0,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "blog_published_idx" ON "blog_posts" ("is_published");
CREATE INDEX "blog_slug_idx" ON "blog_posts" ("slug");
