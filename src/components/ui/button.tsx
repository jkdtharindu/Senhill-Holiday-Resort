/**
 * Buttons and button-styled links (Slice 12).
 *
 * `Button` and `LinkButton` are deliberately separate rather than one
 * polymorphic component: a navigation is an `<a>` and an action is a
 * `<button>`, and collapsing them behind an `as` prop makes it easy to ship
 * a link that cannot be middle-clicked or a button that a screen reader
 * announces as a link. Same styles, honest elements.
 *
 * Both are server-safe — no hooks, no event handlers of their own — so a
 * server component can render them without pulling a client bundle in.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cx, FOCUS_RING } from "./styles";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-teal-800 text-white hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600",
  secondary:
    "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800",
  // Destructive actions are never the primary-coloured button on a screen —
  // deactivating an admin or declining a booking should not look like the
  // safe default action.
  danger:
    "bg-red-700 text-white hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700",
  ghost:
    "text-stone-700 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800",
};

function classesFor(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return cx(BASE, SIZES[size], VARIANTS[variant], FOCUS_RING, extra);
}

interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulted explicitly: an un-typed <button> inside a <form> submits it,
      // which has surprised enough people to be worth pinning down here.
      type={type}
      className={classesFor(variant, size, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

interface LinkButtonProps extends Omit<ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={classesFor(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
