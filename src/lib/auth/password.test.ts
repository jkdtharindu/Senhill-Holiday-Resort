import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_PASSWORD_LENGTH,
  fakeVerifyPassword,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "./password.ts";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    assert.ok(await verifyPassword("correct-horse-battery-staple", hash));
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    assert.ok(!(await verifyPassword("Correct-horse-battery-staple", hash)));
    assert.ok(!(await verifyPassword("", hash)));
  });

  it("never stores the password in the hash", async () => {
    const secret = "unmistakable-plaintext-marker";
    const hash = await hashPassword(secret);
    assert.ok(!hash.includes(secret));
    assert.ok(hash.startsWith("$2"));
  });

  it("produces a different hash each time for the same password", async () => {
    // Distinct salts, so two admins choosing the same password do not end up
    // with matching rows — which would reveal that fact to anyone reading the
    // table.
    const [a, b] = await Promise.all([
      hashPassword("same-password-twice-over"),
      hashPassword("same-password-twice-over"),
    ]);
    assert.notEqual(a, b);
    assert.ok(await verifyPassword("same-password-twice-over", a));
    assert.ok(await verifyPassword("same-password-twice-over", b));
  });
});

describe("password strength", () => {
  it("accepts a password at the minimum length", async () => {
    assert.equal(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH)), null);
  });

  it("rejects anything shorter, explaining what to do instead", () => {
    const message = validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1));
    assert.ok(message !== null);
    assert.match(message, new RegExp(String(MIN_PASSWORD_LENGTH)));
  });

  it("accepts a long passphrase with no symbols", () => {
    // Length is what matters; demanding symbols pushes people toward short,
    // memorable-to-nobody passwords they then write down.
    assert.equal(
      validatePasswordStrength("harbour lantern meadow cobalt thicket"),
      null,
    );
  });
});

describe("fakeVerifyPassword", () => {
  it("always fails", async () => {
    assert.equal(await fakeVerifyPassword("anything at all"), false);
  });

  it("takes comparable time to a real verification", async () => {
    // Guards the user-enumeration defence: if the no-such-account path returned
    // instantly, response timing would reveal which emails are real admins.
    const hash = await hashPassword("some-real-password-here");

    const realStart = performance.now();
    await verifyPassword("wrong-password-entirely", hash);
    const realMs = performance.now() - realStart;

    const fakeStart = performance.now();
    await fakeVerifyPassword("wrong-password-entirely");
    const fakeMs = performance.now() - fakeStart;

    // Generous bounds — this asserts "same order of magnitude", not a precise
    // constant, so it does not turn flaky on a loaded machine.
    assert.ok(
      fakeMs > realMs / 4,
      `fake path (${fakeMs.toFixed(0)}ms) far faster than real (${realMs.toFixed(0)}ms) — timing leak`,
    );
  });
});
