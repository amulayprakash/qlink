"use client";

import { useActionState, useCallback, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import {
  CaretDown,
  CaretUp,
  DotsSixVertical,
  FolderPlus,
  Gear,
  PencilSimple,
  Plus,
  TrashSimple,
} from "@phosphor-icons/react";
import { savePage } from "@/app/dashboard/actions";
import { Avatar } from "@/components/Avatar";
import { Select } from "@/components/ui/Select";
import { PhonePreview } from "@/components/editor/PhonePreview";
import {
  TitleBioModal,
  type ProfileDraft,
} from "@/components/editor/TitleBioModal";
import type { PublicProfile } from "@/components/CreatorPageView";
import { PAGE_THEMES, PAGE_THEME_IDS, accentIsUsable } from "@/lib/themes";
import { MAX_LINKS_PER_PAGE, MAX_SECTIONS_PER_PAGE } from "@/lib/validation";
import type { PageSection } from "@/lib/sections";
import type { ActionState } from "@/lib/forms";
import type { Package, PageFontKey } from "@/lib/types";
import {
  editorReducer,
  initEditorState,
  serializeSections,
  type EditorAction,
  type EditorLink,
  type EditorSection,
  type EditorState,
} from "@/components/editor/state";

type Dispatch = (a: EditorAction) => void;

type EditorPackage = Pick<
  Package,
  "id" | "name" | "description" | "price_usd" | "features"
>;

/**
 * The page editor — and the dashboard's main screen.
 *
 * The shape of this screen follows the creator's model, which is NOT the data
 * model: they have links, and optionally collections OF links. The database
 * only has sections, so one section plays "not in a collection" — see
 * EditorState.bucketId. Its links render bare at the top; every other links
 * section renders as a collection card.
 *
 * "use client" lives here, not in a library: @dnd-kit/react ships without the
 * directive (verified: its index.js opens with a bare `import from 'react'`),
 * so importing it from a Server Component throws.
 *
 * Every drag has a keyboard equivalent that dispatches the SAME reducer action.
 * Motivated: that is not belt-and-braces, it is the actual requirement. A drag
 * handle that only responds to a pointer fails WCAG 2.1.1, and cross-section
 * moves in particular have no natural keyboard gesture.
 */
export function SectionsEditor({
  profile,
  sections,
  packages,
  publicUrl,
  isPublished,
}: {
  profile: PublicProfile;
  sections: PageSection[];
  packages: EditorPackage[];
  publicUrl: string;
  isPublished: boolean;
}) {
  const [state, dispatch] = useReducer(
    editorReducer,
    undefined,
    () => initEditorState(sections, profile.theme, profile.theme_config ?? {}),
  );
  const [saved, formAction, pending] = useActionState<ActionState, FormData>(
    savePage,
    undefined,
  );

  /**
   * The profile header's fields, mirrored locally.
   *
   * The modal persists them itself, so this is not a draft waiting on "Save
   * page" — it is what has ALREADY been saved, held here so the preview can
   * repaint without a server round trip. Seeded from the server's copy and only
   * ever advanced by a confirmed save.
   */
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    display_name: profile.display_name ?? "",
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const closeProfileModal = useCallback(() => setEditingProfile(false), []);

  const serialized = useMemo(
    () => serializeSections(state.sections),
    [state.sections],
  );
  const totalLinks = serialized.reduce((n, s) => n + s.links.length, 0);

  const accentWarning = useMemo(() => {
    if (!state.config.accent) return null;
    const r = accentIsUsable(state.config.accent, state.theme);
    return r.ok ? null : r.reason;
  }, [state.config.accent, state.theme]);

  // The live preview renders the REAL page component off draft state, so it
  // cannot drift from what visitors get.
  const previewProfile: PublicProfile = {
    ...profile,
    // profileDraft, not profile: the modal saves straight to the DB, and this
    // prop is a server snapshot from page load. Without this the preview keeps
    // showing the old bio until a full navigation.
    display_name: profileDraft.display_name || null,
    bio: profileDraft.bio || null,
    avatar_url: profileDraft.avatar_url || null,
    theme: state.theme,
    theme_config: state.config,
  };
  const previewSections: PageSection[] = state.sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title.trim() || null,
    position: 0,
    collapsible: s.collapsible,
    default_open: s.default_open,
    // Paused links are dropped here for the same reason loadCreatorPage drops
    // them: this claims to be what visitors see, so it has to be.
    links: s.links.filter((l) => l.title.trim() && l.url.trim() && l.is_active),
  }));

  const bucket = state.sections.find((s) => s.id === state.bucketId);
  const collections = state.sections.filter((s) => s.id !== state.bucketId);
  const linkSections = state.sections.filter((s) => s.kind === "links");
  const atLinkLimit = totalLinks >= MAX_LINKS_PER_PAGE;

  function onDragEnd(event: Parameters<
    NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
  >[0]) {
    const type = event.operation.source?.type;
    if (event.canceled) return;

    if (type === "section") {
      const ids = move(
        state.sections.map((s) => s.id),
        event,
      );
      dispatch({ type: "reorderSections", ids: ids as string[] });
      return;
    }

    if (type === "link") {
      // Links sections only: a packages section registers no link droppable, so
      // listing it here would offer dnd a group it can never resolve.
      const groups: Record<string, string[]> = {};
      for (const s of state.sections) {
        if (s.kind === "links") groups[s.id] = s.links.map((l) => l.id);
      }
      const next = move(groups, event);
      dispatch({
        type: "reorderLinks",
        groups: next as Record<string, string[]>,
      });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={formAction} className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Links</h1>
          <div className="flex items-center gap-2">
            {/* lg:hidden — the phone preview is a sidebar on large screens and
                is not rendered at all below it, so small screens need the
                standalone preview route to see their page. */}
            <Link href="/dashboard/preview" className="btn-ghost text-sm lg:hidden">
              Preview
            </Link>
          </div>
        </div>

        <ProfileHeader
          username={profile.username}
          draft={profileDraft}
          onEdit={() => setEditingProfile(true)}
        />

        <button
          type="button"
          className="btn-primary btn-lg w-full"
          disabled={atLinkLimit}
          onClick={() => dispatch({ type: "addQuickLink" })}
        >
          <Plus size={18} weight="bold" />
          Add
        </button>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-outline text-sm"
            disabled={state.sections.length >= MAX_SECTIONS_PER_PAGE}
            onClick={() => dispatch({ type: "addSection" })}
          >
            <FolderPlus size={16} weight="bold" />
            Add collection
          </button>
          <p className="text-xs text-muted">
            {totalLinks} of {MAX_LINKS_PER_PAGE} links
          </p>
        </div>

        {atLinkLimit && (
          <p role="alert" className="text-sm text-danger">
            You have reached the {MAX_LINKS_PER_PAGE}-link limit. Remove a link
            to add another.
          </p>
        )}

        <DragDropProvider onDragEnd={onDragEnd}>
          <div className="space-y-4">
            {/* The bucket: links with no collection, rendered bare. It has no
                drag handle — there is no card to grab, and it is the anchor the
                collections move around. Its LINKS reorder and move out freely. */}
            {bucket && bucket.links.length > 0 && (
              <div className="space-y-3">
                {bucket.links.map((link, li) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    index={li}
                    count={bucket.links.length}
                    sectionId={bucket.id}
                    sections={state.sections}
                    bucketId={state.bucketId}
                    dispatch={dispatch}
                  />
                ))}
              </div>
            )}

            {collections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                index={state.sections.indexOf(section)}
                count={state.sections.length}
                sections={state.sections}
                bucketId={state.bucketId}
                packageCount={packages.length}
                atLinkLimit={atLinkLimit}
                dispatch={dispatch}
              />
            ))}

            {totalLinks === 0 && linkSections.length <= 1 && (
              <div className="card border-dashed p-8 text-center">
                <p className="font-semibold">No links yet</p>
                <p className="mt-1 text-sm text-muted">
                  Hit <span className="text-foreground">Add</span> for a single
                  link, or{" "}
                  <span className="text-foreground">Add collection</span> to
                  group links under a heading.
                </p>
              </div>
            )}
          </div>
        </DragDropProvider>

        <AppearanceBar
          state={state}
          dispatch={dispatch}
          accentWarning={accentWarning}
        />

        <input
          type="hidden"
          name="sections"
          value={JSON.stringify(serialized)}
        />
        <input type="hidden" name="theme" value={state.theme} />
        <input type="hidden" name="font" value={state.config.font ?? "sans"} />
        <input type="hidden" name="accent" value={state.config.accent ?? ""} />

        {saved?.error && (
          <p role="alert" className="text-sm text-danger">
            {saved.error}
          </p>
        )}

        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-border bg-card/90 p-3 backdrop-blur">
          <span aria-live="polite" className="text-sm text-muted">
            {pending
              ? "Saving…"
              : saved?.ok && !state.dirty
                ? "Saved ✓"
                : state.dirty
                  ? "Unsaved changes"
                  : ""}
          </span>
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !!accentWarning}
          >
            {pending ? "Saving…" : "Save page"}
          </button>
        </div>
      </form>

      {/* hidden below lg: a 320px phone frame does not fit beside the editor on
          a small screen, and stacking it under the form puts it a scroll away
          from the controls it is supposed to answer. /dashboard/preview is the
          small-screen path, linked from the header above. */}
      <aside className="hidden min-w-0 lg:block">
        <PhonePreview
          profile={previewProfile}
          sections={previewSections}
          packages={packages}
          publicUrl={publicUrl}
          isPublished={isPublished}
        />
      </aside>

      {/* OUTSIDE the <form> above, deliberately: this dialog contains its own
          form, and a form nested in a form is invalid HTML that browsers repair
          by dropping the inner one — the Save button would post the link editor
          instead of the profile.

          Mounted only while open, which is what makes its field seeding
          correct. See TitleBioModal. */}
      {editingProfile && (
        <TitleBioModal
          userId={profile.id}
          initial={profileDraft}
          onClose={closeProfileModal}
          onSaved={setProfileDraft}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Who the page is for, and the way in to changing it.
 *
 * The whole card is one button rather than a card with a pencil in the corner:
 * the target people aim at is their own name, and a 32px icon at the far right
 * is the hardest thing on the row to hit. The pencil stays as an affordance —
 * it says "editable" — but it is decoration inside the button, not a second
 * control.
 */
function ProfileHeader({
  username,
  draft,
  onEdit,
}: {
  username: string | null;
  draft: ProfileDraft;
  onEdit: () => void;
}) {
  const name = draft.display_name || `@${username}`;
  return (
    <button
      type="button"
      onClick={onEdit}
      className="card flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border">
        <Avatar src={draft.avatar_url} name={name} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        {draft.bio ? (
          <p className="truncate text-sm text-muted">{draft.bio}</p>
        ) : (
          <p className="text-sm text-muted">Add a bio</p>
        )}
      </div>
      <span className="btn-ghost shrink-0 px-2" aria-hidden="true">
        <PencilSimple size={16} weight="bold" />
      </span>
    </button>
  );
}

/**
 * A collection, or the packages block.
 *
 * Both kinds share the header, the drag handle and the collapsible controls,
 * because to the creator they ARE the same thing: a block they can move and
 * fold. Only the body differs — a packages section has no links to edit, since
 * its contents live on /dashboard/packages.
 */
function SectionCard({
  section,
  index,
  count,
  sections,
  bucketId,
  packageCount,
  atLinkLimit,
  dispatch,
}: {
  section: EditorSection;
  index: number;
  count: number;
  sections: EditorSection[];
  bucketId: string | null;
  packageCount: number;
  atLinkLimit: boolean;
  dispatch: Dispatch;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: section.id,
    index,
    type: "section",
    accept: ["section"],
  });

  const isPackages = section.kind === "packages";
  const name = section.title || (isPackages ? "Packages" : `Collection ${index + 1}`);

  return (
    <div
      ref={ref}
      className={[
        "card p-4",
        isDragging ? "opacity-60 ring-2 ring-brand-600" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <Grip handleRef={handleRef} label={`Reorder ${name}`} />
        <input
          className="input-bare font-semibold"
          placeholder={isPackages ? "Packages" : "Collection title (optional)"}
          value={section.title}
          maxLength={80}
          aria-label={isPackages ? "Packages title" : "Collection title"}
          onChange={(e) =>
            dispatch({
              type: "setSectionTitle",
              sectionId: section.id,
              title: e.target.value,
            })
          }
        />
        <NudgeButtons
          label={isPackages ? "packages" : "collection"}
          index={index}
          count={count}
          onMove={(delta) =>
            dispatch({ type: "moveSection", sectionId: section.id, delta })
          }
        />
        {/* No delete for packages: it is the only thing positioning the
            creator's packages, and there is exactly one. Deleting it would
            take their packages off the page — to hide those, pause them on
            the packages screen, which is reversible and says what it does. */}
        {!isPackages && (
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label={`Delete ${name}`}
            onClick={() =>
              dispatch({ type: "removeSection", sectionId: section.id })
            }
          >
            <TrashSimple size={16} weight="bold" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 pl-9">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={section.collapsible}
            onChange={(e) =>
              dispatch({
                type: "setCollapsible",
                sectionId: section.id,
                value: e.target.checked,
              })
            }
          />
          Collapsible
        </label>
        {section.collapsible && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={section.default_open}
              onChange={(e) =>
                dispatch({
                  type: "setDefaultOpen",
                  sectionId: section.id,
                  value: e.target.checked,
                })
              }
            />
            Open by default
          </label>
        )}
      </div>

      {isPackages ? (
        <PackagesBody count={packageCount} />
      ) : (
        <div className="mt-3 space-y-2 pl-9">
          {section.links.length === 0 && (
            <p className="text-sm text-muted">No links in this collection yet.</p>
          )}
          {section.links.map((link, li) => (
            <LinkCard
              key={link.id}
              link={link}
              index={li}
              count={section.links.length}
              sectionId={section.id}
              sections={sections}
              bucketId={bucketId}
              dispatch={dispatch}
            />
          ))}
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={atLinkLimit}
            onClick={() => dispatch({ type: "addLink", sectionId: section.id })}
          >
            <Plus size={14} weight="bold" />
            Add link
          </button>
        </div>
      )}
    </div>
  );
}

/** The packages section's body. It edits nothing: packages are their own table
 *  with their own screen, and this section only decides where they sit and
 *  whether they fold. Saying so beats an empty card that looks broken. */
function PackagesBody({ count }: { count: number }) {
  return (
    <div className="mt-3 pl-9">
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
        <p className="text-sm text-muted">
          {count === 0 ? (
            <>
              No packages yet — this section stays hidden on your page until you
              add one.
            </>
          ) : (
            <>
              {count} {count === 1 ? "package" : "packages"}, shown here on your
              page.
            </>
          )}{" "}
          <Link
            href="/dashboard/packages"
            className="whitespace-nowrap text-brand-600 underline"
          >
            {count === 0 ? "Add packages" : "Edit packages"} →
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * One link.
 *
 * Renders the same inside a collection and at the top level; only the
 * "Move to…" options differ, and those are computed from the section list.
 */
function LinkCard({
  link,
  index,
  count,
  sectionId,
  sections,
  bucketId,
  dispatch,
}: {
  link: EditorLink;
  index: number;
  count: number;
  sectionId: string;
  sections: EditorSection[];
  bucketId: string | null;
  dispatch: Dispatch;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: link.id,
    index,
    type: "link",
    accept: ["link"],
    group: sectionId,
  });

  const label = link.title.trim() || `link ${index + 1}`;

  // Numbered BEFORE filtering, so a collection keeps the same number the
  // creator sees on its card. Filtering first numbers the survivors 1..n and
  // points "Collection 2" at whatever happens to come second in the menu.
  const targets = sections
    .map((s, i) => ({ ...s, number: i + 1 }))
    .filter((s) => s.kind === "links" && s.id !== sectionId);

  return (
    <div
      ref={ref}
      className={[
        "card flex items-center gap-2 p-3",
        isDragging ? "opacity-60 ring-2 ring-brand-600" : "",
        // A paused link is dimmed, not hidden: it is still draggable, still
        // editable, and one click from being back on the page.
        link.is_active ? "" : "opacity-60",
      ].join(" ")}
    >
      <Grip handleRef={handleRef} label={`Reorder ${label}`} />

      <div className="min-w-0 flex-1 space-y-0.5">
        <input
          className="input-bare font-medium"
          placeholder="Title"
          value={link.title}
          aria-label="Link title"
          maxLength={80}
          onChange={(e) =>
            dispatch({
              type: "setLinkField",
              sectionId,
              linkId: link.id,
              field: "title",
              value: e.target.value,
            })
          }
        />
        <input
          className="input-bare text-xs text-muted"
          placeholder="example.com"
          value={link.url}
          aria-label="Link URL"
          inputMode="url"
          onChange={(e) =>
            dispatch({
              type: "setLinkField",
              sectionId,
              linkId: link.id,
              field: "url",
              value: e.target.value,
            })
          }
        />
      </div>

      <NudgeButtons
        label="link"
        index={index}
        count={count}
        onMove={(delta) =>
          dispatch({ type: "moveLink", sectionId, linkId: link.id, delta })
        }
      />

      {/* Motivated: dragging a link into another collection is a pointer-only
          gesture. This select is the keyboard and screen-reader path for the
          same operation, and it dispatches the same action. */}
      {targets.length > 0 && (
        <Select
          className="w-auto shrink-0"
          size="sm"
          ariaLabel={`Move ${label} to another collection`}
          placeholder="Move to…"
          value=""
          onChange={(toId) =>
            dispatch({
              type: "moveLinkToSection",
              fromId: sectionId,
              toId,
              linkId: link.id,
            })
          }
          options={targets.map((s) => ({
            value: s.id,
            label:
              s.id === bucketId
                ? "Top level"
                : s.title.trim() || `Collection ${s.number}`,
          }))}
        />
      )}

      <label className="switch shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={link.is_active}
          aria-label={`Show ${label} on my page`}
          onChange={(e) =>
            dispatch({
              type: "toggleLink",
              sectionId,
              linkId: link.id,
              value: e.target.checked,
            })
          }
        />
        <span className="switch-thumb" />
      </label>

      <button
        type="button"
        className="btn-ghost shrink-0 px-2"
        aria-label={`Remove ${label}`}
        onClick={() => dispatch({ type: "removeLink", sectionId, linkId: link.id })}
      >
        <TrashSimple size={15} weight="bold" />
      </button>
    </div>
  );
}

/** Drag handle. Only the handle is draggable, never the whole card: the card is
 *  full of text inputs that must stay clickable and selectable. */
function Grip({
  handleRef,
  label,
}: {
  handleRef: (el: Element | null) => void;
  label: string;
}) {
  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={label}
      className="btn-ghost shrink-0 cursor-grab px-1 active:cursor-grabbing"
    >
      <DotsSixVertical size={16} weight="bold" />
    </button>
  );
}

/** The guaranteed keyboard path for reordering. Motivated: this works whether
 *  or not the drag sensor does, and it is discoverable without knowing that a
 *  handle can be activated with a key at all. */
function NudgeButtons({
  label,
  index,
  count,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        className="btn-ghost px-1 py-0"
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => onMove(-1)}
      >
        <CaretUp size={12} weight="bold" />
      </button>
      <button
        type="button"
        className="btn-ghost px-1 py-0"
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
        onClick={() => onMove(1)}
      >
        <CaretDown size={12} weight="bold" />
      </button>
    </div>
  );
}

/**
 * Theme, font and accent.
 *
 * Folded into a native <details> rather than sitting above the links: it is set
 * once and then rarely touched, and the links are what the creator came for.
 * <details> and not a JS disclosure — it costs no state, and the summary gets
 * Enter/Space and the expanded announcement from the UA.
 */
function AppearanceBar({
  state,
  dispatch,
  accentWarning,
}: {
  state: EditorState;
  dispatch: Dispatch;
  accentWarning: string | null;
}) {
  const accent =
    state.config.accent ??
    PAGE_THEMES[state.theme as keyof typeof PAGE_THEMES]?.accent ??
    "#c5f24e";

  return (
    <details className="card p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Gear size={16} weight="bold" />
        Appearance
        <span className="ml-auto text-xs font-normal text-muted">
          {PAGE_THEMES[state.theme as keyof typeof PAGE_THEMES]?.label ??
            state.theme}
        </span>
      </summary>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="theme-picker">
              Theme
            </label>
            <Select
              id="theme-picker"
              className="w-44"
              value={state.theme}
              onChange={(theme) => dispatch({ type: "setTheme", theme })}
              options={PAGE_THEME_IDS.map((id) => ({
                value: id,
                label: PAGE_THEMES[id].label,
              }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="font-picker">
              Font
            </label>
            <Select
              id="font-picker"
              className="w-32"
              value={state.config.font ?? "sans"}
              onChange={(font) =>
                dispatch({ type: "setFont", font: font as PageFontKey })
              }
              options={[
                { value: "sans", label: "Sans" },
                { value: "serif", label: "Serif" },
              ]}
            />
          </div>

          <div>
            <label className="label" htmlFor="accent-picker">
              Accent
            </label>
            <div className="flex items-center gap-2">
              <input
                id="accent-picker"
                type="color"
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                value={accent}
                onChange={(e) =>
                  dispatch({ type: "setAccent", accent: e.target.value })
                }
              />
              {state.config.accent && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => dispatch({ type: "setAccent", accent: undefined })}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {accentWarning && (
          <p role="alert" className="text-sm text-danger">
            {accentWarning}
          </p>
        )}
      </div>
    </details>
  );
}
