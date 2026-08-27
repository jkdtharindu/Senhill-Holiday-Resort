CREATE TYPE "public"."email_event" AS ENUM('booking_confirmation', 'admin_new_booking_alert', 'booking_approved', 'booking_declined', 'booking_cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_outcome" AS ENUM('sent', 'failed', 'skipped_no_api_key', 'blocked_daily_limit');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" "email_event" NOT NULL,
	"outcome" "email_outcome" NOT NULL,
	"recipients" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"subject" text NOT NULL,
	"error_message" text,
	"booking_id" uuid,
	"sent_on" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_recipient_count_positive" CHECK ("email_log"."recipient_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_sent_on_idx" ON "email_log" USING btree ("sent_on");--> statement-breakpoint
CREATE INDEX "email_log_outcome_idx" ON "email_log" USING btree ("outcome","sent_at");--> statement-breakpoint
CREATE INDEX "email_log_booking_idx" ON "email_log" USING btree ("booking_id");