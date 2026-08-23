/**
 * Customer sign-in via Google (Auth.js / NextAuth v5).
 *
 * FOR GUESTS ONLY. This system can never produce admin access:
 *   - it writes to `customers` and reads no admin table;
 *   - its session carries no role and nothing reads one from it;
 *   - admin routes verify a separate cookie signed with ADMIN_JWT_SECRET,
 *     which this system does not hold.
 *
 * Changing any of that is HITL-gated (docs/HITL.md) — the separation is what
 * stops a misconfigured OAuth setup from reaching the approval mechanism.
 *
 * Sessions are JWT-based with no database adapter, so Auth.js creates no tables
 * of its own. The one customer row is managed in lib/auth/customer.ts.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { findOrCreateCustomer } from "@/lib/auth/customer";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Guest sign-in cannot work without it — see docs/GOOGLE_OAUTH_SETUP.md.`,
    );
  }
  return value;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js looks for AUTH_SECRET; this project names it NEXTAUTH_SECRET in
  // .env.example, and it is deliberately a different value from
  // ADMIN_JWT_SECRET so the two systems stay cryptographically unrelated.
  secret: requiredEnv("NEXTAUTH_SECRET"),

  providers: [
    Google({
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  callbacks: {
    /**
     * Gate on a verified email address.
     *
     * Google reports whether it has confirmed the address belongs to the
     * account holder. Unverified ones are refused because the booking record
     * uses this address to identify the guest to staff, and an unverified
     * address can be one somebody simply typed in.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (!profile?.email) return false;
      return profile.email_verified === true;
    },

    /**
     * Runs on sign-in and on every session read.
     *
     * The database write happens only on the first call, when `account` is
     * present — otherwise every page load would hit the database to re-resolve
     * a customer whose id is already in the token.
     */
    async jwt({ token, account, profile }) {
      if (account && profile?.sub && profile.email) {
        const customer = await findOrCreateCustomer({
          googleId: profile.sub,
          email: profile.email,
          name: profile.name ?? profile.email,
        });
        token.customerId = customer.id;
      }
      return token;
    },

    /**
     * Expose the customer's own id to the app.
     *
     * Deliberately the `customers.id`, not Google's `sub`: bookings are keyed
     * on it, and the rest of the app should never need to know a Google
     * identifier exists.
     */
    async session({ session, token }) {
      if (token.customerId && session.user) {
        session.user.id = token.customerId as string;
      }
      return session;
    },
  },
});
