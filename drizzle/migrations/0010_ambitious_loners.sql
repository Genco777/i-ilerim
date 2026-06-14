CREATE TABLE "wizard_states" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
