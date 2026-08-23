CREATE TABLE "admin_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"succeeded" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_login_attempts_email_idx" ON "admin_login_attempts" USING btree ("email","attempted_at");--> statement-breakpoint
CREATE INDEX "admin_login_attempts_ip_idx" ON "admin_login_attempts" USING btree ("ip_address","attempted_at");