CREATE TABLE "email_preferences" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"theme" text DEFAULT 'dark_steel' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
