/**
* Tests for admin session tokens (src/lib/auth/admin-token.ts).
 *
 * The property worth proving here is negative: a token this system did not
 * issue must not verify. That is what keeps a customer's Google session from
 * ever being accepted as an admin one.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { SignJWT } from "jose";

// Set before importing the module under test — it reads these at call time,
// but being explicit here keeps the test independent of any .env file.
process.env.ADMIN_JWT_SECRET = "test-admin-secret-not-used-anywhere-real-0001";
process.env.NEXTAUTH_SECRET = "test-customer-secret-entirely-different-0002";

const { createAdminToken, verifyAdminToken } = await import("./admin-token.ts");

const SESSION = {
  adminId: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.invalid",
  name: "Test Admin",
  role: "admin" as const,
};

describe("admin session tokens", () => {
  let token: string;

  before(async () => {
    token = await createAdminToken(SESSION);
  });

  it("round-trips a session it issued", async () => {
    assert.deepEqual(await verifyAdminToken(token), SESSION);
  });

  it("preserves the super_admin role", async () => {
    const superToken = await createAdminToken({ ...SESSION, role: "super_admin" });
    const verified = await verifyAdminToken(superToken);
    assert.equal(verified?.role, "super_admin");
  });

  it("rejects a tampered payload", async () => {
    // Flip a character in the payload segment; the signature no longer matches.
    const [header, payload, signature] = token.split(".");
    const tampered = [
      header,
      payload.slice(0, -2) + (payload.at(-2) === "A" ? "B" : "A") + payload.at(-1),
      signature,
    ].join(".");
    assert.equal(await verifyAdminToken(tampered), null);
  });

  it("rejects a token signed with the customer secret", async () => {
    // This is the separation-of-systems guarantee: even a perfectly-formed
    // token, with the right issuer and audience, signed by the customer auth
    // system's secret must not open an admin session.
    const forged = await new SignJWT({
      email: SESSION.email,
      name: SESSION.name,
      role: "super_admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(SESSION.adminId)
      .setIssuer("senhill:admin")
      .setAudience("senhill:admin-panel")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));

    assert.equal(await verifyAdminToken(forged), null);
  });

  it("rejects a token from a different issuer", async () => {
    const forged = await new SignJWT({ ...SESSION, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(SESSION.adminId)
      .setIssuer("somewhere-else")
      .setAudience("senhill:admin-panel")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!));

    assert.equal(await verifyAdminToken(forged), null);
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({ ...SESSION })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(SESSION.adminId)
      .setIssuer("senhill:admin")
      .setAudience("senhill:admin-panel")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!));

    assert.equal(await verifyAdminToken(expired), null);
  });

  it("rejects a token carrying a role outside the allowed set", async () => {
    const forged = await new SignJWT({
      email: SESSION.email,
      name: SESSION.name,
      role: "owner", // not a real role
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(SESSION.adminId)
      .setIssuer("senhill:admin")
      .setAudience("senhill:admin-panel")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!));

    assert.equal(await verifyAdminToken(forged), null);
  });

  it("rejects rubbish", async () => {
    assert.equal(await verifyAdminToken("not-a-token"), null);
    assert.equal(await verifyAdminToken(""), null);
    assert.equal(await verifyAdminToken("a.b.c"), null);
  });
});
