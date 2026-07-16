"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import type { ActionState } from "@/lib/forms";

type LinkRow = { title: string; url: string };

export function ProfileForm({
  userId,
  initial,
  action,
  submitLabel = "Continue",
  showLinks = true,
}: {
  userId: string;
  initial: {
    display_name: string;
    bio: string;
    avatar_url: string;
    links: LinkRow[];
  };
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel?: string;
  /** Onboarding still collects links here. The dashboard passes false, because
   *  the page editor owns links once sections exist and two editors writing the
   *  same rows would silently flatten the creator's groups. When false, no
   *  `links` field is submitted at all and the action leaves links untouched. */
  showLinks?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    undefined,
  );
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [links, setLinks] = useState<LinkRow[]>(
    initial.links.length ? initial.links : [],
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (error) {
        alert(`Upload failed: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  const cleanLinks = links.filter((l) => l.title.trim() || l.url.trim());

  return (
    <form action={formAction} className="space-y-5">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="mt-1 text-sm text-muted">
          How your page introduces you.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-50">
            <Avatar src={avatarUrl} />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFile}
            />
            <button
              type="button"
              className="btn-outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                className="btn-ghost ml-2"
                onClick={() => setAvatarUrl("")}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <label className="label" htmlFor="display_name">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            className="input"
            defaultValue={initial.display_name}
            placeholder="Ada Lovelace"
            maxLength={80}
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="bio">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            className="input min-h-20"
            defaultValue={initial.bio}
            placeholder="What you do, in one line."
            maxLength={280}
          />
        </div>
      </div>

      {showLinks && (
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Links</h2>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => setLinks((l) => [...l, { title: "", url: "" }])}
          >
            + Add link
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          Optional. Socials, portfolio, anything.
        </p>

        <div className="mt-4 space-y-3">
          {links.length === 0 && (
            <p className="text-sm text-muted">No links yet.</p>
          )}
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input"
                placeholder="Title"
                value={l.title}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((x, idx) =>
                      idx === i ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                className="input"
                placeholder="example.com"
                value={l.url}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((x, idx) =>
                      idx === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn-ghost px-3"
                onClick={() =>
                  setLinks((ls) => ls.filter((_, idx) => idx !== i))
                }
                aria-label="Remove link"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      )}

      <input type="hidden" name="avatar_url" value={avatarUrl} />
      {showLinks && (
        <input type="hidden" name="links" value={JSON.stringify(cleanLinks)} />
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-end gap-3">
        {state?.ok && <span className="text-sm text-accent">Saved ✓</span>}
        <button
          type="submit"
          className="btn-primary btn-lg"
          disabled={pending || uploading}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
