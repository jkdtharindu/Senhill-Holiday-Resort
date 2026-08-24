/**
 * Card surface and page-level layout shells (Slice 12).
 *
 * `PageShell` exists so every screen agrees on background, gutters and
 * maximum width. The gutter is `px-4` on phones widening to `px-6` — guests
 * book from a phone (docs/tasks.md), so the narrow case is the default and
 * the desktop case is the enhancement, not the other way round.
 */

import type { ReactNode } from "react";

import { BORDER, CARD, cx, EYEBROW, PAGE_BG, TEXT_BODY, TEXT_HEADING } from "./styles";

interface PageShellProps {
  children: ReactNode;
  /** Content width. `wide` suits admin tables; `narrow` suits forms. */
  width?: "narrow" | "default" | "wide";
  className?: string;
}

const WIDTHS = {
  narrow: "max-w-xl",
  default: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

export function PageShell({
  children,
  width = "default",
  className,
}: PageShellProps) {
  return (
    // `flex-1` rather than `min-h-dvh`: the root layout's body is a flex
    // column, so this fills the space left under the header. `min-h-dvh` would
    // add a full viewport BELOW the header and leave every page scrollable by
    // exactly the header's height.
    <main className={cx("flex-1 px-4 py-10 sm:px-6 sm:py-12", PAGE_BG)}>
      <div
        className={cx(
          "mx-auto flex w-full flex-col gap-8",
          WIDTHS[width],
          className,
        )}
      >
        {children}
      </div>
    </main>
  );
}

interface PageHeaderProps {
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Actions aligned to the right of the title on wider screens. */
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        {eyebrow !== undefined && <p className={EYEBROW}>{eyebrow}</p>}
        <h1
          className={cx("text-2xl font-semibold tracking-tight", TEXT_HEADING)}
        >
          {title}
        </h1>
        {description !== undefined && (
          <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
            {description}
          </p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </header>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <section className={cx(CARD, className)}>{children}</section>;
}

interface CardSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** A titled card with standard padding — the default building block. */
export function CardPanel({
  title,
  description,
  children,
  actions,
  className,
}: CardSectionProps) {
  return (
    <Card className={cx("flex flex-col", className)}>
      {(title !== undefined || actions !== undefined) && (
        <div
          className={cx(
            "flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3",
            BORDER,
          )}
        >
          <div className="flex flex-col gap-1">
            {title !== undefined && (
              <h2 className={cx("text-sm font-semibold", TEXT_HEADING)}>
                {title}
              </h2>
            )}
            {description !== undefined && (
              <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
                {description}
              </p>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          )}
        </div>
      )}
      {children !== undefined && <div className="px-4 py-4">{children}</div>}
    </Card>
  );
}

interface DescriptionListProps {
  items: Array<{ label: ReactNode; value: ReactNode }>;
  className?: string;
}

/**
 * Label/value pairs — used heavily on the admin booking detail screen.
 * Stacks on a phone and becomes two columns once there is room, so a long
 * value never gets squeezed into a sliver of width beside its label.
 */
export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={cx("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <dt
            className={cx(
              "text-xs font-medium uppercase tracking-wide",
              "text-stone-500 dark:text-stone-500",
            )}
          >
            {item.label}
          </dt>
          <dd className={cx("text-sm", TEXT_HEADING)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center",
        BORDER,
      )}
    >
      <p className={cx("text-sm font-medium", TEXT_HEADING)}>{title}</p>
      {description !== undefined && (
        <p className={cx("max-w-sm text-sm leading-relaxed", TEXT_BODY)}>
          {description}
        </p>
      )}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
