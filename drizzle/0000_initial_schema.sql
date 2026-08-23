CREATE TYPE "public"."admin_role" AS ENUM('admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('reserved', 'booked', 'declined');--> statement-breakpoint
CREATE TYPE "public"."day_mode_kind" AS ENUM('room_mode', 'villa_mode');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('room', 'villa');--> statement-breakpoint
CREATE TYPE "public"."payment_stage" AS ENUM('unpaid', 'advance_paid', 'fully_paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."vote_kind" AS ENUM('approve', 'decline');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "approval_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"vote" "vote_kind" NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_votes_one_per_admin" UNIQUE("booking_id","admin_id")
);
--> statement-breakpoint
CREATE TABLE "bookable_item_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bookable_item_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookable_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "item_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capacity" integer NOT NULL,
	"custom_notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookable_items_capacity_positive" CHECK ("bookable_items"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "booking_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"changed_by" uuid,
	"changed_by_name" text NOT NULL,
	"field_changed" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bookable_item_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"guests_count" integer NOT NULL,
	"status" "booking_status" DEFAULT 'reserved' NOT NULL,
	"payment_stage" "payment_stage" DEFAULT 'unpaid' NOT NULL,
	"advance_amount" numeric(12, 2),
	"advance_paid_date" date,
	"internal_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_checkout_after_checkin" CHECK ("bookings"."check_out" > "bookings"."check_in"),
	CONSTRAINT "bookings_guests_positive" CHECK ("bookings"."guests_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "day_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"mode" "day_mode_kind" NOT NULL,
	"set_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_modes_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"default_notes" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_votes" ADD CONSTRAINT "approval_votes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_votes" ADD CONSTRAINT "approval_votes_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookable_item_images" ADD CONSTRAINT "bookable_item_images_bookable_item_id_bookable_items_id_fk" FOREIGN KEY ("bookable_item_id") REFERENCES "public"."bookable_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_audit_log" ADD CONSTRAINT "booking_audit_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_audit_log" ADD CONSTRAINT "booking_audit_log_changed_by_admin_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bookable_item_id_bookable_items_id_fk" FOREIGN KEY ("bookable_item_id") REFERENCES "public"."bookable_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_modes" ADD CONSTRAINT "day_modes_set_by_admin_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_votes_booking_idx" ON "approval_votes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "bookable_item_images_item_idx" ON "bookable_item_images" USING btree ("bookable_item_id","display_order");--> statement-breakpoint
CREATE INDEX "bookable_items_active_kind_idx" ON "bookable_items" USING btree ("active","kind","display_order");--> statement-breakpoint
CREATE INDEX "booking_audit_log_booking_idx" ON "booking_audit_log" USING btree ("booking_id","changed_at");--> statement-breakpoint
CREATE INDEX "bookings_item_dates_idx" ON "bookings" USING btree ("bookable_item_id","check_in","check_out");--> statement-breakpoint
CREATE INDEX "bookings_status_dates_idx" ON "bookings" USING btree ("status","check_in","check_out");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "day_modes_date_idx" ON "day_modes" USING btree ("date");