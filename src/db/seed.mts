/**
 * Seed script — run once against a fresh database: `npm run db:seed`
 *
 * Creates the first super_admin, placeholder Rooms and the Villa, and the
 * single site_settings row. Safe to re-run: every insert is keyed on something
 * unique and skips if the row already exists, so this will not duplicate data
 * or overwrite content an admin has since edited through the panel.
 *
 * The Room and Villa entries here are PLACEHOLDERS, labelled as such in their
 * descriptions. Real names, capacities, photos and notes get entered by an
 * admin through the panel — see docs/tasks.md. Do not treat these numbers as
 * the property's actual inventory.
 *
 * NOTE: this writes to whatever DATABASE_URL points at. Running it against a
 * non-local database is HITL-gated per docs/HITL.md.
 */

import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

// Loaded before the dynamic imports below, deliberately. `./index.ts` reads
// DATABASE_URL at module scope to build its connection pool, so a static import
// would be hoisted and evaluated before these lines ran — and the pool would be
// constructed against an undefined URL. Hence: config first, import second.
// This file is `.mts` rather than `.ts` so top-level await is available.
config({ path: ".env.local" });
config({ path: ".env" });

const { db } = await import("./index.ts");
const { adminUsers, bookableItems, siteSettings } = await import("./schema.ts");

/** Cost factor for bcrypt. 12 is the current sensible default. */
const BCRYPT_ROUNDS = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local before seeding — see .env.example.`,
    );
  }
  return value;
}

async function seedSuperAdmin(): Promise<void> {
  const email = requireEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase().trim();
  const password = requireEnv("SEED_SUPER_ADMIN_PASSWORD");

  if (password.length < 12) {
    throw new Error(
      "SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters. This account can " +
        "create and remove every other admin, so a weak password here undermines " +
        "the entire approval system.",
    );
  }

  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  super_admin already exists (${email}) — left untouched`);
    return;
  }

  await db.insert(adminUsers).values({
    name: "Owner",
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: "super_admin",
    active: true,
    createdBy: null, // nobody created the first one
  });

  console.log(`  created super_admin: ${email}`);
}

/**
 * Placeholder inventory.
 *
 * Capacities are guesses derived from the marketing copy in
 * docs/source-material, which says the property sleeps 15 in total. They exist
 * so the calendar and booking flow have something to run against during the
 * build — replace them with the real inventory before launch.
 */
const PLACEHOLDER_ITEMS = [
  {
    kind: "room" as const,
    name: "Room 1 (placeholder)",
    capacity: 4,
    displayOrder: 1,
  },
  {
    kind: "room" as const,
    name: "Room 2 (placeholder)",
    capacity: 4,
    displayOrder: 2,
  },
  {
    kind: "room" as const,
    name: "Room 3 (placeholder)",
    capacity: 4,
    displayOrder: 3,
  },
  {
    kind: "villa" as const,
    name: "Whole Villa (placeholder)",
    capacity: 15,
    displayOrder: 10,
  },
];

async function seedBookableItems(): Promise<void> {
  for (const item of PLACEHOLDER_ITEMS) {
    const existing = await db
      .select({ id: bookableItems.id })
      .from(bookableItems)
      .where(eq(bookableItems.name, item.name))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  "${item.name}" already exists — left untouched`);
      continue;
    }

    await db.insert(bookableItems).values({
      ...item,
      description:
        "PLACEHOLDER — replace this with the real description through the admin panel.",
      customNotes: "",
      active: true,
    });
    console.log(`  created ${item.kind}: ${item.name} (sleeps ${item.capacity})`);
  }
}

async function seedSiteSettings(): Promise<void> {
  const existing = await db.select({ id: siteSettings.id }).from(siteSettings).limit(1);

  if (existing.length > 0) {
    console.log("  site_settings row already exists — left untouched");
    return;
  }

  await db.insert(siteSettings).values({
    defaultNotes:
      "PLACEHOLDER — replace through the admin panel. This block should cover " +
      "check-in and check-out times, house rules, and anything every guest needs " +
      "to know regardless of which room or the villa they book.",
  });
  console.log("  created site_settings row");
}

async function main(): Promise<void> {
  console.log("Seeding Senhill Holiday Resort database\n");

  console.log("Admin:");
  await seedSuperAdmin();

  console.log("\nBookable items:");
  await seedBookableItems();

  console.log("\nSite settings:");
  await seedSiteSettings();

  console.log("\nDone.");
  console.log(
    "\nReminder: a booking needs TWO different admins to approve it before it " +
      "reaches `booked`. Only the super_admin exists so far — create a second " +
      "admin from the panel, or nothing can ever be confirmed.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("\nSeed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
