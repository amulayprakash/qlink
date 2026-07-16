"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { updateProfile } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import type { ActionState } from "@/lib/forms";

/** Mirrors the limits the profile form has always used. */
const MAX_TITLE = 80;
const MAX_BIO = 280;

export type ProfileDraft = {
  display_name: string;
  bio: string;
  avatar_url: string;
};

/**
 * Edit the page's title, bio and photo without leaving the editor.
 *
 * Saves on its own, through the SAME updateProfile action the profile page
 * used, rather than riding along with the editor's "Save page" button.
 * Motivated: those are different rows (profiles vs sections/links) and, more to
 * the point, different intentions — you change your bio once and expect it to
 * stick, while you shuffle links for ten minutes before saving. Folding them
 * into one button would mean a bio edit could be lost by a link edit failing
 * validation.
 *
 * updateProfile only touches links when a `links` field is present. This form
 * never sends one, so it leaves links and sections alone; see the `editsLinks`
 * guard in the action.
 *
 * Built on <dialog>: the UA gives focus trapping, Esc-to-close, an inert
 * background and ::backdrop for free. A div-with-a-fixed-overlay gives none of
 * those and has to reimplement all four, badly.
 *
 * MOUNTED ONLY WHILE OPEN (the parent guards with `{open && ...}`), which is
 * what makes the seeding correct: useState initialisers run once per opening,
 * so a cancelled edit cannot leak into the next one and a re-render mid-typing
 * cannot reset the fields under the creator's cursor.
 */
export function TitleBioModal({
  userId,
  initial,
  onClose,
  onSaved,
}: {
  userId: string;
  initial: ProfileDraft;
  onClose: () => void;
  /** Hands the saved values back so the live preview updates without a round
   *  trip to the server. */
  onSaved: (draft: ProfileDraft) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saved, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfile,
    undefined,
  );

  const [name, setName] = useState(initial.display_name);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // showModal(), not the `open` attribute: only the method call gets the top
  // layer, the backdrop and the focus trap. The attribute alone renders a
  // non-modal dialog the page can still be tabbed behind.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // The action reports success through useActionState, so committing and
  // closing hangs off that result rather than off a submit handler. The ref
  // guard stops a re-render from firing onSaved twice before the unmount lands.
  const done = useRef(false);
  useEffect(() => {
    if (!saved?.ok || done.current) return;
    done.current = true;
    onSaved({ display_name: name, bio, avatar_url: avatarUrl });
    onClose();
  }, [saved, name, bio, avatarUrl, onSaved, onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (error) {
        // Inline, not alert(): an alert is dismissed before it is read and
        // cannot be re-read.
        setUploadError(error.message);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <dialog
      ref={ref}
      // Esc routes through the parent's state too, or the dialog would close
      // while `open` stayed true and then refuse to reopen.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click landing on <dialog> itself is a click on the backdrop: the
        // form below covers the whole content box.
        if (e.target === ref.current) onClose();
      }}
      className="card m-auto w-[min(30rem,calc(100vw-2rem))] p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      aria-labelledby="title-bio-heading"
    >
      <form action={formAction} className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="title-bio-heading" className="font-semibold">
            Title and bio
          </h2>
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border">
            <Avatar src={avatarUrl} name={name} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFile}
            />
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => setAvatarUrl("")}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        {uploadError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            Upload failed: {uploadError}
          </p>
        )}

        <div className="mt-5">
          <label className="label" htmlFor="modal-title">
            Title
          </label>
          <input
            id="modal-title"
            name="display_name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
            maxLength={MAX_TITLE}
          />
          <Counter value={name.length} max={MAX_TITLE} />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="modal-bio">
            Bio
          </label>
          <textarea
            id="modal-bio"
            name="bio"
            className="input min-h-24"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="What you do, in one line."
            maxLength={MAX_BIO}
          />
          <Counter value={bio.length} max={MAX_BIO} />
        </div>

        <input type="hidden" name="avatar_url" value={avatarUrl} />

        {saved?.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {saved.error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary btn-lg mt-5 w-full"
          disabled={pending || uploading}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </dialog>
  );
}

/** Shows how much room is left, and goes red only once it is gone — a counter
 *  that is always coloured is just decoration. */
function Counter({ value, max }: { value: number; max: number }) {
  return (
    <p
      className={[
        "mt-1 text-right text-xs",
        value >= max ? "text-danger" : "text-muted",
      ].join(" ")}
    >
      {value} / {max}
    </p>
  );
}
