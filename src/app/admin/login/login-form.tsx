"use client";

/**
 * Staff sign-in form (Slice 2; moved onto the shared field primitives in
 * Slice 12).
 *
 * The failure message is whatever the endpoint returns, verbatim. Slice 2
 * makes a wrong password and an unknown email byte-identical on purpose, so
 * this must not add any local reasoning about which one it was.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { cx, TEXT_MUTED } from "@/components/ui/styles";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Could not sign in. Please try again.");
        setPassword("");
        setSubmitting(false);
        return;
      }

      // refresh() so the server components re-read the new session cookie;
      // replace() alone can serve a cached tree that still thinks nobody is
      // signed in.
      router.replace("/admin");
      router.refresh();
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && <Alert tone="error">{error}</Alert>}

      <TextField
        id="email"
        label="Email"
        type="email"
        required
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={submitting}
      />

      <TextField
        id="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={submitting}
      />

      <Button type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className={cx("text-xs leading-relaxed", TEXT_MUTED)}>
        Forgot your password? Ask a super admin to reset it — there is no
        self-service reset, so nobody can take over an account through an email
        inbox.
      </p>
    </form>
  );
}
