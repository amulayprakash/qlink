"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  PLATFORMS,
  looksLikeUrl,
  platformForUrl,
  resolveUrl,
  type Platform,
} from "@/lib/platforms";
import { linkSchema } from "@/lib/validation";
import type { NewLinkDraft } from "@/components/editor/state";

/** Mirrors the cap linkSchema enforces on a title. */
const MAX_TITLE = 80;

/** Step 2 for a custom link, where the creator names it themselves. Not a
 *  Platform: it has no slug, no hosts and no glyph. */
const CUSTOM = { label: "Custom link", hint: "example.com" } as const;

type Picked = Platform | typeof CUSTOM;

function isPlatform(p: Picked): p is Platform {
  return "slug" in p;
}

/**
 * The "Add" picker: choose a well-known site, or paste anything.
 *
 * Replaces the old behaviour of dropping a blank row into the list for the
 * creator to fill in. Motivated: a blank row cannot know it is an Instagram
 * link, and knowing that is what lets the page draw a glyph instead of the word
 * "Instagram" — so the platform has to be a CHOICE, made once, rather than
 * something guessed from a URL that the creator can edit afterwards.
 *
 * Two steps, because they ask different questions: "what are you adding" and
 * then "which account". Pasting a URL answers both at once and skips ahead.
 *
 * Built on <dialog> and mounted only while open, for the reasons TitleBioModal
 * spells out — the UA's focus trap, Esc and inert background, and useState
 * seeding that a cancelled add cannot leak into the next opening. Unlike that
 * modal this one persists NOTHING: it hands a draft back and the editor's
 * "Save page" writes it, so an add is as undoable as any other edit until then.
 */
export function AddLinkModal({
  onAdd,
  onClose,
}: {
  onAdd: (draft: NewLinkDraft) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        // Routed through the parent's state, or the dialog closes while the
        // parent still thinks it is open and then refuses to reopen.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="card m-auto w-[min(32rem,calc(100vw-2rem))] p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      aria-labelledby="add-link-heading"
    >
      <div className="flex items-center justify-between gap-4 p-5 pb-0">
        <h2 id="add-link-heading" className="font-semibold">
          {picked ? `Add ${picked.label}` : "Add"}
        </h2>
        <button
          type="button"
          className="btn-ghost px-2"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={16} weight="bold" />
        </button>
      </div>

      {picked ? (
        <DetailStep
          picked={picked}
          // Whatever was typed at step 1, IF it was a URL. A half-typed search
          // for "insta" is not a starting value for the handle field.
          seedUrl={looksLikeUrl(query.trim()) ? query.trim() : ""}
          onBack={() => setPicked(null)}
          onAdd={onAdd}
        />
      ) : (
        <PickStep query={query} onQuery={setQuery} onPick={setPicked} />
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------

/** Step 1: what are you adding? */
function PickStep({
  query,
  onQuery,
  onPick,
}: {
  query: string;
  onQuery: (v: string) => void;
  onPick: (p: Picked) => void;
}) {
  const q = query.trim();

  /**
   * A pasted URL is an answer, not a search term.
   *
   * Filtering the catalogue by "https://instagram.com/ada" matches nothing, so
   * the most natural way to use this box — paste the link you already have —
   * would show an empty list. Instead the paste collapses the list to the one
   * row it identified, or to Custom link when no platform claims the host.
   */
  const pasted = looksLikeUrl(q) ? q : "";
  const detected = pasted ? platformForUrl(pasted) : undefined;

  const matches = useMemo(() => {
    const needle = q.toLowerCase();
    return PLATFORMS.filter((p) => p.label.toLowerCase().includes(needle));
  }, [q]);

  return (
    <div className="p-5">
      <div className="relative">
        <MagnifyingGlassIcon
          size={16}
          weight="bold"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        />
        <input
          className="input pl-9"
          // autoFocus is right here and wrong almost everywhere else: this
          // dialog exists to answer one question, the field IS the question,
          // and the UA has just moved focus into the dialog anyway.
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Paste or search a link"
          aria-label="Paste or search a link"
        />
      </div>

      <ul className="mt-4 max-h-[min(24rem,50dvh)] space-y-1 overflow-y-auto">
        {pasted ? (
          <Row
            slug={detected?.slug}
            label={detected?.label ?? CUSTOM.label}
            sub={pasted}
            onClick={() => onPick(detected ?? CUSTOM)}
          />
        ) : (
          <>
            {matches.map((p) => (
              <Row
                key={p.slug}
                slug={p.slug}
                label={p.label}
                onClick={() => onPick(p)}
              />
            ))}
            {/* Last, not first: it is the fallback for the ~12 rows above, and
                a creator who came to add their Instagram should not have to
                read past "Custom link" to find it. */}
            <Row
              label={CUSTOM.label}
              sub="Any other URL"
              onClick={() => onPick(CUSTOM)}
            />
          </>
        )}
      </ul>
    </div>
  );
}

/** One choice. A <button> in a list, not an <a>: nothing here navigates. */
function Row({
  slug,
  label,
  sub,
  onClick,
}: {
  slug?: string;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-white/[0.04]">
          <PlatformIcon slug={slug} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          {sub && (
            <span className="block truncate text-xs text-muted">{sub}</span>
          )}
        </span>
        <CaretRightIcon
          size={14}
          weight="bold"
          aria-hidden="true"
          className="shrink-0 text-muted"
        />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

/** Step 2: which account, and where should it render? */
function DetailStep({
  picked,
  seedUrl,
  onBack,
  onAdd,
}: {
  picked: Picked;
  seedUrl: string;
  onBack: () => void;
  onAdd: (draft: NewLinkDraft) => void;
}) {
  const platform = isPlatform(picked) ? picked : undefined;

  const [value, setValue] = useState(seedUrl);
  const [title, setTitle] = useState(platform ? platform.label : "");
  /**
   * On by default for a platform, and this is the feature.
   *
   * Someone adding their Instagram to a links page wants the icon row every
   * other links page has; a pill reading "Instagram" is the thing they would
   * then go looking for a way to change. The switch sits right here with the
   * consequence written next to it, and the phone preview repaints as soon as
   * the link lands, so the default is visible rather than assumed.
   */
  const [asIcon, setAsIcon] = useState(Boolean(platform));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const url = resolveUrl(platform, value);
    // The same schema the server parses, so the modal cannot accept something
    // "Save page" would later reject with the whole page in the balance.
    const parsed = linkSchema.safeParse({
      title: title.trim() || platform?.label,
      url,
      platform: platform?.slug ?? null,
      show_as_icon: asIcon,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details");
      return;
    }
    onAdd(parsed.data);
  }

  return (
    // A <form>, so Enter submits — this is a one-field dialog and reaching for
    // the mouse to finish it would be absurd. Not action={}: nothing here
    // touches the server. The parent renders this OUTSIDE the editor's form,
    // so it is not a nested form.
    <form
      className="p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost px-2"
          onClick={onBack}
          aria-label="Back to the list"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-white/[0.04]">
          <PlatformIcon slug={platform?.slug} size={18} />
        </span>
        <p className="text-sm font-medium">{picked.label}</p>
      </div>

      {/* A custom link has no label to borrow, so it asks for one. A platform
          link is titled after the platform and can be renamed in the editor —
          asking here would be a second field to fill for the answer we already
          have. */}
      {!platform && (
        <div className="mt-4">
          <label className="label" htmlFor="add-link-title">
            Title
          </label>
          <input
            id="add-link-title"
            className="input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My newsletter"
            maxLength={MAX_TITLE}
          />
        </div>
      )}

      <div className="mt-4">
        <label className="label" htmlFor="add-link-value">
          {platform?.urlFor ? "Username or link" : "Link"}
        </label>
        <input
          id="add-link-value"
          className="input"
          autoFocus={Boolean(platform)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            // Clear on edit, or the creator fixes the typo and still reads an
            // error about it.
            setError(null);
          }}
          placeholder={picked.hint}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {platform && (
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <span className="switch mt-0.5">
            <input
              type="checkbox"
              className="sr-only"
              checked={asIcon}
              onChange={(e) => setAsIcon(e.target.checked)}
            />
            <span className="switch-thumb" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              Show as icon under bio
            </span>
            <span className="block text-xs text-muted">
              {asIcon
                ? "Renders as a small icon under your bio, not as a link in the list."
                : `Renders as a "${platform.label}" link in the list.`}
            </span>
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary btn-lg mt-5 w-full">
        Add
      </button>
    </form>
  );
}
