/**
 * Form field primitives (Slice 12).
 *
 * Every input here takes a required `id` and `label` and wires them together
 * with `htmlFor`, plus `aria-describedby` for the hint and error text. That
 * pairing is not decoration: without it a screen reader announces an unlabelled
 * text box, and the whole admin panel becomes unusable non-visually. Making
 * `label` required is the cheapest way to stop a screen shipping without one.
 *
 * These are plain (server-safe) components. State lives in the client
 * component that renders them, so the same primitives serve both a
 * `useState`-driven form and an uncontrolled server-action form.
 */

import type { ComponentProps, ReactNode } from "react";

import { cx, TEXT_MUTED } from "./styles";

const CONTROL = cx(
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none",
  "focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700/30",
  "disabled:opacity-60",
  "dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100",
);

const CONTROL_INVALID =
  "border-red-500 focus-visible:border-red-600 focus-visible:ring-red-600/30 dark:border-red-700";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error, with the aria wiring done once. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-sm font-medium text-stone-800 dark:text-stone-200"
      >
        {label}
        {required === true && (
          <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint !== undefined && error == null && (
        <p id={`${id}-hint`} className={cx("text-xs leading-relaxed", TEXT_MUTED)}>
          {hint}
        </p>
      )}
      {error != null && (
        <p
          id={`${id}-error`}
          className="text-xs leading-relaxed text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Which element `aria-describedby` should point at, given hint/error state. */
function describedBy(id: string, hint: ReactNode, error: string | null | undefined) {
  if (error != null) return `${id}-error`;
  if (hint !== undefined) return `${id}-hint`;
  return undefined;
}

type SharedFieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  containerClassName?: string;
};

export function TextField({
  id,
  label,
  hint,
  error,
  containerClassName,
  required,
  className,
  ...rest
}: SharedFieldProps & Omit<ComponentProps<"input">, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error != null || undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, error != null && CONTROL_INVALID, className)}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  containerClassName,
  required,
  className,
  rows = 4,
  ...rest
}: SharedFieldProps & Omit<ComponentProps<"textarea">, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error != null || undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, "resize-y", error != null && CONTROL_INVALID, className)}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  containerClassName,
  required,
  className,
  children,
  ...rest
}: SharedFieldProps & Omit<ComponentProps<"select">, "id">) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error != null || undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, error != null && CONTROL_INVALID, className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
