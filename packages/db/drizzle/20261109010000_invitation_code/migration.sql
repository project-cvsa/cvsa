CREATE TABLE IF NOT EXISTS "auth"."invitation_code" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL,
	"role_id" integer NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invitation_code_code_key" UNIQUE("code"),
	CONSTRAINT "invitation_code_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "meta"."role"("id"),
	CONSTRAINT "invitation_code_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_code_code_idx" ON "auth"."invitation_code" ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."invitation_redemption" (
	"id" serial PRIMARY KEY,
	"invitation_code_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_redemption_code_id_fkey" FOREIGN KEY ("invitation_code_id") REFERENCES "auth"."invitation_code"("id") ON DELETE CASCADE,
	CONSTRAINT "invitation_redemption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_redemption_code_id_idx" ON "auth"."invitation_redemption" ("invitation_code_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_redemption_user_id_idx" ON "auth"."invitation_redemption" ("user_id");
