/**
 * Tests for image upload validation.
 *
 * The property worth proving: a file is judged by its actual bytes, never by
 * what the request claims it is. Renaming a file, or lying in the Content-Type
 * header, must not get it past validation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ImageValidationError,
  MAX_IMAGE_BYTES,
  sniffImageType,
  validateImage,
} from "./images.ts";

/** Minimal byte sequences carrying each format's real signature. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = new Uint8Array([
  ...[0x52, 0x49, 0x46, 0x46], // "RIFF"
  ...[0x24, 0x00, 0x00, 0x00], // size
  ...[0x57, 0x45, 0x42, 0x50], // "WEBP"
]);

describe("sniffImageType", () => {
  it("recognises the three accepted formats", () => {
    assert.equal(sniffImageType(JPEG), "image/jpeg");
    assert.equal(sniffImageType(PNG), "image/png");
    assert.equal(sniffImageType(WEBP), "image/webp");
  });

  it("rejects a Windows executable", () => {
    // "MZ" header — the classic case of an .exe renamed to .jpg.
    assert.equal(sniffImageType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null);
  });

  it("rejects a PDF", () => {
    // "%PDF"
    assert.equal(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null);
  });

  it("rejects an SVG, which can carry script", () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    assert.equal(sniffImageType(svg), null);
  });

  it("rejects HTML", () => {
    assert.equal(sniffImageType(new TextEncoder().encode("<!doctype html>")), null);
  });

  it("rejects a truncated signature rather than guessing", () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null); // JPEG, one byte short
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e])), null); // PNG, cut off
    assert.equal(sniffImageType(new Uint8Array()), null);
  });

  it("rejects RIFF that is not WebP", () => {
    // A .wav file is also RIFF — only the bytes at offset 8 separate them.
    const wav = new Uint8Array([
      ...[0x52, 0x49, 0x46, 0x46],
      ...[0x24, 0x00, 0x00, 0x00],
      ...[0x57, 0x41, 0x56, 0x45], // "WAVE"
    ]);
    assert.equal(sniffImageType(wav), null);
  });
});

describe("validateImage", () => {
  it("accepts a real image and reports its type", () => {
    assert.equal(validateImage(JPEG), "image/jpeg");
    assert.equal(validateImage(PNG), "image/png");
    assert.equal(validateImage(WEBP), "image/webp");
  });

  it("rejects an empty file", () => {
    assert.throws(() => validateImage(new Uint8Array()), ImageValidationError);
  });

  it("rejects a file over the size limit, naming the actual size", () => {
    const tooBig = new Uint8Array(MAX_IMAGE_BYTES + 1);
    tooBig.set(JPEG); // valid signature, just far too large
    assert.throws(
      () => validateImage(tooBig),
      (err: unknown) =>
        err instanceof ImageValidationError && /8 MB/.test((err as Error).message),
    );
  });

  it("accepts a file exactly at the limit", () => {
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set(JPEG);
    assert.equal(validateImage(atLimit), "image/jpeg");
  });

  it("rejects a non-image however it was named or declared", () => {
    // The whole point: validation never sees the filename or the declared
    // Content-Type, so neither can be used to smuggle something through.
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    assert.throws(
      () => validateImage(exe),
      (err: unknown) =>
        err instanceof ImageValidationError &&
        /renaming a file does not change what it is/.test((err as Error).message),
    );
  });

  it("checks size before type, so a huge non-image is not fully scanned", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1000);
    assert.throws(
      () => validateImage(huge),
      (err: unknown) => err instanceof ImageValidationError && /limit is 8 MB/.test((err as Error).message),
    );
  });
});
