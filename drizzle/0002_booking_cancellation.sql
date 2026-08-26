ALTER TYPE "public"."booking_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_admin_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_at_matches_status" CHECK (("bookings"."status"::text = 'cancelled') = ("bookings"."cancelled_at" IS NOT NULL));