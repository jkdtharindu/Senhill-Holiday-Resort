/**
 * Tests for the post-sign-in redirect guard (Slice 12).
 *
 * The property worth proving: nothing that leaves our origin is ever
 * returned. The protocol-relative cases (`//host`, `/\host`) are the ones
 * worth being explicit about — they read as local paths but browsers resolve
 * them to a different host entirely, and a naive `startsWith("/")` check
 * lets them straight through.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNext } from "./safe-next.ts";

describe("safeNext — allows genuine internal paths", () => {
  it("keeps a plain path", () => {
    assert.equal(safeNext("/my-bookings"), "/my-bookings");
  });

  it("keeps a path with a query string", () => {
    assert.equal(
      safeNext("/book?item=abc&from=2026-09-10"),
      "/book?item=abc&from=2026-09-10",
    );
  });

  it("keeps a nested path", () => {
    assert.equal(safeNext("/calendar/2026-09-10"), "/calendar/2026-09-10");
  });
});

describe("safeNext — refuses anything leaving our origin", () => {
  it("refuses an absolute http URL", () => {
    assert.equal(safeNext("https://evil.example/login"), "/");
  });

  it("refuses a protocol-relative URL, which looks like a path", () => {
    assert.equal(safeNext("//evil.example"), "/");
  });

  it("refuses a backslash protocol-relative URL, which browsers normalise", () => {
    assert.equal(safeNext("/\u005cevil.example"), "/");
  });

  it("refuses a javascript: URL", () => {
    assert.equal(safeNext("javascript:alert(1)"), "/");
  });

  it("refuses a bare hostname", () => {
    assert.equal(safeNext("evil.example"), "/");
  });
});

describe("safeNext — refuses header-splitting and junk input", () => {
  it("refuses an embedded newline", () => {
    assert.equal(safeNext("/ok\nLocation: https://evil.example"), "/");
  });

  it("refuses an embedded carriage return", () => {
    assert.equal(safeNext("/ok\r\nSet-Cookie: a=b"), "/");
  });

  it("refuses a NUL byte", () => {
    assert.equal(safeNext("/ok\u0000"), "/");
  });

  it("falls back for a non-string", () => {
    assert.equal(safeNext(undefined), "/");
    assert.equal(safeNext(null), "/");
    assert.equal(safeNext(42), "/");
    assert.equal(safeNext(["/a"]), "/");
  });

  it("falls back for an empty string", () => {
    assert.equal(safeNext(""), "/");
  });
});
