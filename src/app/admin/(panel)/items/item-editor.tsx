"use client";

/**
 * Room / villa editor with photo management (Slice 12) — the UI over Slice 4's
 * `PATCH /bookable-items/:id` and the image endpoints.
 *
 * Capacity reduction is the interesting case. The endpoint refuses to shrink
 * capacity below what existing bookings already hold, and returns a 409 the
 * admin can override with `force`. That override is surfaced as an explicit
 * second step with the consequence spelled out — never as a `force: true` the
 * form always sends, which would silently disable the check entirely.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { BORDER, cx, TEXT_MUTED } from "@/components/ui/styles";
import type { ItemWithPhotos } from "@/lib/items-service";

interface ItemEditorProps {
  item: ItemWithPhotos;
  maxPhotos: number;
}

export function ItemEditor({ item, maxPhotos }: ItemEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [capacity, setCapacity] = useState(String(item.capacity));
  const [customNotes, setCustomNotes] = useState(item.customNotes);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** Set when the server refused a capacity cut and offered the override. */
  const [capacityConflict, setCapacityConflict] = useState<string | null>(null);

  async function save(force: boolean) {
    setError(null);
    setSaved(null);
    if (!force) setCapacityConflict(null);

    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      setError("Capacity must be a whole number of at least 1.");
      return;
    }

    const patch: Record<string, unknown> = {};
    if (name !== item.name) patch.name = name;
    if (description !== item.description) patch.description = description;
    if (parsedCapacity !== item.capacity) patch.capacity = parsedCapacity;
    if (customNotes !== item.customNotes) patch.customNotes = customNotes;
    if (force) patch.force = true;

    if (Object.keys(patch).length === 0 || (force && Object.keys(patch).length === 1)) {
      setSaved("Nothing changed.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/bookable-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (response.status === 409) {
        setCapacityConflict(
          data?.error ??
            "Existing bookings hold more guests than the new capacity allows.",
        );
        setBusy(false);
        return;
      }
      if (!response.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        setBusy(false);
        return;
      }

      setCapacityConflict(null);
      setSaved("Saved.");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/bookable-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not change availability.");
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image file first.");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setBusy(true);
    try {
      const response = await fetch(`/api/bookable-items/${item.id}/images`, {
        method: "POST",
        // No Content-Type header: the browser must set the multipart boundary.
        body: form,
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not upload that image.");
        setBusy(false);
        return;
      }

      if (fileInputRef.current !== null) fileInputRef.current.value = "";
      setSaved("Photo added.");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  async function deletePhoto(imageId: string) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/bookable-items/${item.id}/images/${imageId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not remove that photo.");
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  const atPhotoLimit = item.photos.length >= maxPhotos;

  return (
    <div className="flex flex-col gap-5">
      {error !== null && <Alert tone="error">{error}</Alert>}
      {saved !== null && <Alert tone="success">{saved}</Alert>}

      {capacityConflict !== null && (
        <Alert tone="warning" title="Existing bookings exceed this capacity">
          <p className="mt-1">{capacityConflict}</p>
          <p className="mt-1">
            Saving anyway keeps those bookings as they are — it does not cancel
            or shrink them. Only new bookings will be held to the lower number.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={() => save(true)}>
              Save anyway
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCapacityConflict(null);
                setCapacity(String(item.capacity));
              }}
            >
              Keep {item.capacity}
            </Button>
          </div>
        </Alert>
      )}

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TextField
            id={`name-${item.id}`}
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            containerClassName="sm:col-span-2"
          />
          <TextField
            id={`capacity-${item.id}`}
            label="Sleeps"
            type="number"
            min={1}
            required
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            disabled={busy}
          />
        </div>

        <TextAreaField
          id={`description-${item.id}`}
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={4}
          hint="Shown to guests on the room page."
        />

        <TextAreaField
          id={`notes-${item.id}`}
          label="Custom notes"
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
          disabled={busy}
          rows={3}
          hint="Shown to guests alongside the site-wide notes, for anything specific to this room."
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </Button>
          <Button
            type="button"
            variant={item.active ? "danger" : "secondary"}
            disabled={busy}
            onClick={() => setActive(!item.active)}
          >
            {item.active ? "Hide from guests" : "Show to guests"}
          </Button>
        </div>
      </form>

      <div className={cx("flex flex-col gap-3 border-t pt-5", BORDER)}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Photos
          </h3>
          <span className={cx("text-xs", TEXT_MUTED)}>
            {item.photos.length} of {maxPhotos}
          </span>
        </div>

        {item.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {item.photos.map((photo, i) => (
              <li key={photo.id} className="flex flex-col gap-1">
                <div className="relative aspect-square overflow-hidden rounded-md bg-stone-200 dark:bg-stone-800">
                  <Image
                    src={photo.imageUrl}
                    alt={`${item.name} photo ${i + 1}`}
                    fill
                    sizes="150px"
                    className="object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-1 top-1">
                      <Badge tone="info">Cover</Badge>
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => deletePhoto(photo.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {atPhotoLimit ? (
          <p className={cx("text-xs", TEXT_MUTED)}>
            This item has the maximum of {maxPhotos} photos. Remove one before
            adding another.
          </p>
        ) : (
          <form onSubmit={uploadPhoto} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`photo-${item.id}`}
                className="text-sm font-medium text-stone-800 dark:text-stone-200"
              >
                Add a photo
              </label>
              <input
                ref={fileInputRef}
                id={`photo-${item.id}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                className="text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-800 dark:text-stone-300 dark:file:bg-stone-800 dark:file:text-stone-200"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
