/**
 * Image upload validation and storage.
 *
 * Admins replace room photos regularly, so this is a routine path rather than a
 * one-off import — which is exactly why it needs real limits. An upload
 * endpoint without them is a way for anyone who reaches it to fill the store
 * with arbitrary files.
 *
 * The central rule here: **never trust the declared content type.** A browser
 * sends `Content-Type` from the file picker, and a script can send whatever it
 * likes. The only reliable signal is what the file actually begins with, so
 * every upload is sniffed for a real image signature before it is stored.
 */

import { del, put } from "@vercel/blob";

/** Formats accepted. Deliberately narrow — these three cover every camera and phone. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/**
 * Largest accepted upload, in bytes.
 *
 * 8 MB comfortably fits a full-resolution phone photo. Vercel optimises images
 * on delivery, so a large original costs storage but not page speed.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Most images one Room or the Villa may hold. Guards against unbounded growth. */
export const MAX_IMAGES_PER_ITEM = 12;

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Identify a file from its leading bytes.
 *
 * Returns the real type, or null if the bytes are not one of the formats we
 * accept. A renamed `.exe`, an SVG carrying script, or a PDF with a `.jpg`
 * extension all fail here regardless of what the request claimed.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }

  // WebP: "RIFF" then four size bytes then "WEBP"
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

const EXTENSION_FOR: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Check an upload and report the type its bytes actually are.
 * Throws `ImageValidationError` with a message safe to show an admin.
 */
export function validateImage(bytes: Uint8Array): AllowedImageType {
  if (bytes.length === 0) {
    throw new ImageValidationError("That file is empty.");
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    const limit = MAX_IMAGE_BYTES / 1024 / 1024;
    throw new ImageValidationError(
      `That image is ${mb} MB. The limit is ${limit} MB — try exporting it at a smaller size.`,
    );
  }

  const actualType = sniffImageType(bytes);
  if (!actualType) {
    throw new ImageValidationError(
      "That file isn't a JPEG, PNG or WebP image. Check you picked the right file — " +
        "renaming a file does not change what it is.",
    );
  }

  return actualType;
}

/**
 * Store an image and return its public URL.
 *
 * `addRandomSuffix` keeps two photos uploaded under the same name from
 * overwriting each other, and stops the stored path being guessable from the
 * original filename.
 */
export async function storeImage(
  bookableItemId: string,
  bytes: Uint8Array,
  type: AllowedImageType,
): Promise<string> {
  const blob = await put(
    `bookable-items/${bookableItemId}/photo.${EXTENSION_FOR[type]}`,
    Buffer.from(bytes),
    {
      access: "public",
      addRandomSuffix: true,
      contentType: type,
    },
  );
  return blob.url;
}

/**
 * Remove an image from storage.
 *
 * Never throws. A blob that is already gone, or a URL that no longer resolves,
 * must not stop the database row being removed — otherwise a half-failed
 * deletion leaves a photo visible in the panel that nothing can shift.
 */
export async function deleteStoredImage(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error(`Could not delete blob ${url}:`, error);
  }
}
