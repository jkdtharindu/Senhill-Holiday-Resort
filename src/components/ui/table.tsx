/**
 * Data table for the admin list screens (Slice 12).
 *
 * Wrapped in an `overflow-x-auto` scroller because these tables carry more
 * columns than a phone can show, and admins do open the panel on a phone. The
 * page itself must never scroll sideways — only the table does.
 *
 * `<caption>` is required rather than optional: it is what a screen reader
 * announces when entering the table, and "Bookings, 12 rows" is the difference
 * between an orientating table and an unlabelled grid of numbers. It is
 * visually hidden by default since the surrounding card already carries a
 * visible heading.
 */

import type { ReactNode } from "react";

import { BORDER, cx, SURFACE } from "./styles";

interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: Row, index: number) => ReactNode;
  /** Hide below the `sm` breakpoint — for columns a phone can do without. */
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  /** Announced to screen readers on entering the table. */
  caption: string;
  columns: Array<TableColumn<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  /** Shown in place of the table body when there are no rows. */
  empty?: ReactNode;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cx("overflow-x-auto rounded-md border", BORDER, SURFACE)}
      // Keyboard users need to be able to scroll this region too, and a
      // scrollable box is only reachable by keyboard if it is focusable.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={cx("border-b", BORDER)}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cx(
                  "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap",
                  "text-stone-500 dark:text-stone-400",
                  col.hideOnMobile === true && "hidden sm:table-cell",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={cx(
                "border-b last:border-b-0",
                BORDER,
                "hover:bg-stone-50 dark:hover:bg-stone-800/50",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-3 py-2.5 align-middle text-stone-800 dark:text-stone-200",
                    col.hideOnMobile === true && "hidden sm:table-cell",
                    col.className,
                  )}
                >
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
