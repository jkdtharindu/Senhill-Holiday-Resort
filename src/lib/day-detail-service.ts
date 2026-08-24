/**
 * Database-backed orchestration for the day-detail view.
 *
 * Split from the pure derivation in lib/day-detail.ts, same pattern as
 * lib/calendar-service.ts and lib/day-mode-service.ts: the route stays a thin
 * HTTP adapter, and this module owns the one fetch-derive cycle so a customer
 * request and an admin request can never disagree about which bookings
 * overlap a date.
 *
 * The admin-only enrichment (guest identity, payment stage, approval votes)
 * is added here, never in the pure module — lib/day-detail.ts must stay safe
 * to reuse for the customer response with zero risk of a guest name slipping
 * through by accident.
 */

import { and, eq, gt, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  adminUsers,
  approvalVotes,
  bookableItems,
  bookings,
  dayModes,
  type DayModeKind,
} from "@/db/schema";
import { itemKindForMode } from "./day-mode";
import type { DateOnly } from "./dates";
import {
  deriveItemStatuses,
  type DayDetailBookingRow,
  type DayDetailItemRow,
  type ItemStatus,
} from "./day-detail";

export interface DayDetailResult {
  date: DateOnly;
  dayMode: DayModeKind | null;
  /** True only when no admin has opened this date for business yet. */
  unavailable: boolean;
  items: ItemStatus[];
}

/** One vote on a booking, as shown to an admin. */
export interface ApprovalVoteDetail {
  adminId: string;
  adminName: string;
  vote: "approve" | "decline";
  votedAt: string;
}

/** Everything an admin sees for one overlapping booking that a customer never does. */
export interface AdminBookingDetail {
  bookingId: string;
  guestName: string;
  phone: string;
  email: string;
  guestsCount: number;
  status: "reserved" | "booked";
  checkIn: DateOnly;
  checkOut: DateOnly;
  paymentStage: string;
  advanceAmount: string | null;
  advancePaidDate: DateOnly | null;
  internalNotes: string;
  approvals: ApprovalVoteDetail[];
}

export interface AdminItemStatus extends ItemStatus {
  booking: AdminBookingDetail | null;
}

export interface AdminDayDetailResult extends Omit<DayDetailResult, "items"> {
  items: AdminItemStatus[];
}

/** The active items offered under a given mode, plus bookings overlapping `date` for them. */
async function loadItemsAndBookings(
  date: DateOnly,
  mode: DayModeKind,
): Promise<{ items: DayDetailItemRow[]; bookings: DayDetailBookingRow[] }> {
  const kind = itemKindForMode(mode);

  const itemRows = await db
    .select({ id: bookableItems.id, name: bookableItems.name, capacity: bookableItems.capacity })
    .from(bookableItems)
    .where(and(eq(bookableItems.kind, kind), eq(bookableItems.active, true)));

  if (itemRows.length === 0) {
    return { items: [], bookings: [] };
  }

  const itemIds = itemRows.map((r) => r.id);
  const rawBookingRows = await db
    .select({
      id: bookings.id,
      bookableItemId: bookings.bookableItemId,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.bookableItemId, itemIds),
        inArray(bookings.status, ["reserved", "booked"]),
        lte(bookings.checkIn, date),
        gt(bookings.checkOut, date),
      ),
    );

  // The WHERE clause guarantees status is only "reserved" | "booked", but
  // Drizzle's inferred type is the full 3-value enum regardless — narrow
  // explicitly, same pattern as calendar-service.ts.
  const bookingRows: DayDetailBookingRow[] = rawBookingRows.map((row) => ({
    ...row,
    status: row.status as "reserved" | "booked",
  }));

  return { items: itemRows, bookings: bookingRows };
}

/** Every ApprovalVote cast on any of these bookings, with the voting admin's current name. */
async function loadApprovalVotes(bookingIds: string[]): Promise<Map<string, ApprovalVoteDetail[]>> {
  const rows = await db
    .select({
      bookingId: approvalVotes.bookingId,
      adminId: approvalVotes.adminId,
      adminName: adminUsers.name,
      vote: approvalVotes.vote,
      votedAt: approvalVotes.votedAt,
    })
    .from(approvalVotes)
    .innerJoin(adminUsers, eq(approvalVotes.adminId, adminUsers.id))
    .where(inArray(approvalVotes.bookingId, bookingIds));

  const byBooking = new Map<string, ApprovalVoteDetail[]>();
  for (const row of rows) {
    const list = byBooking.get(row.bookingId) ?? [];
    list.push({
      adminId: row.adminId,
      adminName: row.adminName,
      vote: row.vote,
      votedAt: row.votedAt.toISOString(),
    });
    byBooking.set(row.bookingId, list);
  }
  return byBooking;
}

/**
 * Customer-facing day-detail: RoomStatus per item, no guest identity.
 * Returns `unavailable: true` (and an empty item list) if no admin has set a
 * DayMode for this date yet — the caller renders this as a simple "not open
 * for booking yet" message, not an error (PRD §9).
 */
export async function fetchDayDetail(date: DateOnly): Promise<DayDetailResult> {
  const [modeRow] = await db
    .select({ mode: dayModes.mode })
    .from(dayModes)
    .where(eq(dayModes.date, date))
    .limit(1);

  if (!modeRow) {
    return { date, dayMode: null, unavailable: true, items: [] };
  }

  const { items, bookings: bookingRows } = await loadItemsAndBookings(date, modeRow.mode);
  const itemStatuses = deriveItemStatuses(date, items, bookingRows);

  return { date, dayMode: modeRow.mode, unavailable: false, items: itemStatuses };
}

/**
 * Admin day-detail: same RoomStatus derivation, plus full guest details,
 * payment stage and approval votes for every overlapping booking. Not
 * restricted by the BookingWindow — admins plan further ahead than customers
 * can book (PRD §9a).
 */
export async function fetchDayDetailAdmin(date: DateOnly): Promise<AdminDayDetailResult> {
  const [modeRow] = await db
    .select({ mode: dayModes.mode })
    .from(dayModes)
    .where(eq(dayModes.date, date))
    .limit(1);

  if (!modeRow) {
    return { date, dayMode: null, unavailable: true, items: [] };
  }

  const { items, bookings: bookingRows } = await loadItemsAndBookings(date, modeRow.mode);
  const itemStatuses = deriveItemStatuses(date, items, bookingRows);

  const bookingIds = itemStatuses
    .map((s) => s.bookingId)
    .filter((id): id is string => id !== null);

  const bookingDetailById = new Map<string, AdminBookingDetail>();
  if (bookingIds.length > 0) {
    const [fullBookingRows, votesByBooking] = await Promise.all([
      db
        .select({
          id: bookings.id,
          guestName: bookings.guestName,
          phone: bookings.phone,
          email: bookings.email,
          guestsCount: bookings.guestsCount,
          status: bookings.status,
          checkIn: bookings.checkIn,
          checkOut: bookings.checkOut,
          paymentStage: bookings.paymentStage,
          advanceAmount: bookings.advanceAmount,
          advancePaidDate: bookings.advancePaidDate,
          internalNotes: bookings.internalNotes,
        })
        .from(bookings)
        .where(inArray(bookings.id, bookingIds)),
      loadApprovalVotes(bookingIds),
    ]);

    for (const row of fullBookingRows) {
      bookingDetailById.set(row.id, {
        bookingId: row.id,
        guestName: row.guestName,
        phone: row.phone,
        email: row.email,
        guestsCount: row.guestsCount,
        status: row.status as "reserved" | "booked",
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        paymentStage: row.paymentStage,
        advanceAmount: row.advanceAmount,
        advancePaidDate: row.advancePaidDate,
        internalNotes: row.internalNotes,
        approvals: votesByBooking.get(row.id) ?? [],
      });
    }
  }

  const adminItems: AdminItemStatus[] = itemStatuses.map((s) => ({
    ...s,
    booking: s.bookingId ? (bookingDetailById.get(s.bookingId) ?? null) : null,
  }));

  return { date, dayMode: modeRow.mode, unavailable: false, items: adminItems };
}
