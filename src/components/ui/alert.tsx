/**
 * Inline alerts (Slice 12).
 *
 * `role="alert"` on the error tone so a screen reader announces a failed
 * submission without the user having to go hunting for what changed. The
 * other tones use `role="status"`, which announces politely rather than
 * interrupting — an "advance payment required" notice should not talk over
 * whatever the user is currently reading.
 */

import type { ReactNode } from "react";

import { cx } from "./styles";

export type AlertTone = "error" | "success" | "warning" | "info";

const TONES: Record<AlertTone, string> = {
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  info: "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200",
};

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = "info", title, children, className }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-3 py-2.5 text-sm leading-relaxed",
        TONES[tone],
        className,
      )}
    >
      {title !== undefined && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  );
}
