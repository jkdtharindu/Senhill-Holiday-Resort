/**
 * Adds the customer's own database id to the Auth.js session type.
 *
 * Note what is absent: no role, no permissions, no admin flag. A customer
 * session is not a weaker admin session — it is a different thing entirely,
 * and there is deliberately no field here that any admin check could read.
 */

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Primary key in `customers`. Not Google's `sub`. */
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    customerId?: string;
  }
}
