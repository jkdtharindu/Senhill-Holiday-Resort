/**
 * Admin-side booking reads (Slice 12).
 *
 * These power the admin bookings list and detail screens. They deliberately
 * live here rather than behind `GET /bookings` and `GET /bookings/:id` — those
 * endpoints were never built, and a server component rendering on the same
 * server has no reason to round-trip through its own API. See
 * docs/API_DOCUMENTATION.md.
 *
 * Everything returned here is admin-only: guest phone numbers, internal notes
 * and payment state. No customer-facing page may call into this module — the
 * guest equivalent is `fetchDayDetail` in day-detail-service.ts, which
 * resolves to RoomStatus and nothing else.
 */

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  adminUsers,
  approvalVotes,
  bookableItems,
  bookingAuditLog,
  bookings,
  type BookingStatus,
  type PaymentStage,
} from "@/db/schema";
import type { DateOnly } from "./dates";

export interface AdminBookingListItem {
  id: string;
  guestName: string;
  phone: string;
  email: string;
  itemName: string;
  itemKind: "room" | "villa";
  checkIn: DateOnly;
  checkOut: DateOnly;
  guestsCount: number;
  status: BookingStatus;
  paymentStage: PaymentStage;
  approveCount: number;
  createdAt: Date;
}

export interface AdminBookingFilters {
  status?: BookingStatus;
  itemId?: string;
  from?: DateOnly;
  to?: DateOnly;
  /** Free-text across guest name, phone and email. */
  q?: string;
}

/**
 * Bookings matching the filters, newest check-in first.
 *
 * The approve count is resolved in a second query and joined in memory rather
 * than as a correlated subquery — the list is small (one property, 90-day
 * horizon) and this keeps the SQL readable.
 */
export async function fetchAdminBookings(
  filters: AdminBookingFilters = {},
): Promise<AdminBookingListItem[]> {
  const conditions: SQL[] = [];

  if (filters.status !== undefined) {
    conditions.push(eq(bookings.status, filters.status));
  }
  if (filters.itemId !== undefined) {
    conditions.push(eq(bookings.bookableItemId, filters.itemId));
  }
  // Date filters bound the STAY, not the check-in: a booking spanning the
  // range counts as being in it, which is what an admin looking at "who is
  // here in September" expects.
  if (filters.from !== undefined) {
    conditions.push(gte(bookings.checkOut, filters.from));
  }
  if (filters.to !== undefined) {
    conditions.push(lte(bookings.checkIn, filters.to));
  }
  if (filters.q !== undefined && filters.q.trim() !== "") {
    const needle = `%${filters.q.trim()}%`;
    const match = or(
      ilike(bookings.guestName, needle),
      ilike(bookings.phone, needle),
      ilike(bookings.email, needle),
    );
    if (match !== undefined) conditions.push(match);
  }

  const rows = await db
    .select({
      id: bookings.id,
      guestName: bookings.guestName,
      phone: bookings.phone,
      email: bookings.email,
      itemName: bookableItems.name,
      itemKind: bookableItems.kind,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      guestsCount: bookings.guestsCount,
      status: bookings.status,
      paymentStage: bookings.paymentStage,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(bookableItems, eq(bookings.bookableItemId, bookableItems.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookings.checkIn));

  if (rows.length === 0) return [];

  const voteRows = await db
    .select({ bookingId: approvalVotes.bookingId, vote: approvalVotes.vote })
    .from(approvalVotes)
    .where(
      inArray(
        approvalVotes.bookingId,
        rows.map((r) => r.id),
      ),
    );

  const approvesByBooking = new Map<string, number>();
  for (const v of voteRows) {
    if (v.vote !== "approve") continue;
    approvesByBooking.set(v.bookingId, (approvesByBooking.get(v.bookingId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    checkIn: row.checkIn as DateOnly,
    checkOut: row.checkOut as DateOnly,
    approveCount: approvesByBooking.get(row.id) ?? 0,
  }));
}

export interface AdminBookingVote {
  adminId: string;
  adminName: string;
  vote: "approve" | "decline";
  votedAt: Date;
}

export interface AdminBookingHistoryEntry {
  id: string;
  changedByName: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

export interface AdminBookingFull {
  id: string;
  guestName: string;
  phone: string;
  email: string;
  itemId: string;
  itemName: string;
  itemKind: "room" | "villa";
  itemCapacity: number;
  checkIn: DateOnly;
  checkOut: DateOnly;
  guestsCount: number;
  status: BookingStatus;
  paymentStage: PaymentStage;
  advanceAmount: string | null;
  advancePaidDate: DateOnly | null;
  internalNotes: string;
  createdAt: Date;
  updatedAt: Date;
  votes: AdminBookingVote[];
  history: AdminBookingHistoryEntry[];
}

/** One booking with its votes and full audit trail, or null if it doesn't exist. */
export async function fetchAdminBooking(id: string): Promise<AdminBookingFull | null> {
  const [row] = await db
    .select({
      id: bookings.id,
      guestName: bookings.guestName,
      phone: bookings.phone,
      email: bookings.email,
      itemId: bookableItems.id,
      itemName: bookableItems.name,
      itemKind: bookableItems.kind,
      itemCapacity: bookableItems.capacity,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      guestsCount: bookings.guestsCount,
      status: bookings.status,
      paymentStage: bookings.paymentStage,
      advanceAmount: bookings.advanceAmount,
      advancePaidDate: bookings.advancePaidDate,
      internalNotes: bookings.internalNotes,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
    })
    .from(bookings)
    .innerJoin(bookableItems, eq(bookings.bookableItemId, bookableItems.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!row) return null;

  const [votes, history] = await Promise.all([
    db
      .select({
        adminId: approvalVotes.adminId,
        // Joined live rather than denormalized: a vote list should show who
        // the admin IS, while the audit log below shows who they WERE at the
        // time — those are different questions.
        adminName: adminUsers.name,
        vote: approvalVotes.vote,
        votedAt: approvalVotes.votedAt,
      })
      .from(approvalVotes)
      .innerJoin(adminUsers, eq(approvalVotes.adminId, adminUsers.id))
      .where(eq(approvalVotes.bookingId, id))
      .orderBy(asc(approvalVotes.votedAt)),
    db
      .select({
        id: bookingAuditLog.id,
        changedByName: bookingAuditLog.changedByName,
        fieldChanged: bookingAuditLog.fieldChanged,
        oldValue: bookingAuditLog.oldValue,
        newValue: bookingAuditLog.newValue,
        changedAt: bookingAuditLog.changedAt,
      })
      .from(bookingAuditLog)
      .where(eq(bookingAuditLog.bookingId, id))
      .orderBy(desc(bookingAuditLog.changedAt)),
  ]);

  return {
    ...row,
    checkIn: row.checkIn as DateOnly,
    checkOut: row.checkOut as DateOnly,
    advancePaidDate: row.advancePaidDate as DateOnly | null,
    votes,
    history,
  };
}
