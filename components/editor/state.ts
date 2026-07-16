import type { PageSection } from "@/lib/sections";
import type { PageFontKey, SectionKind, ThemeConfig } from "@/lib/types";

export type EditorLink = {
  id: string;
  title: string;
  url: string;
  /** False hides the link from the public page. It stays here, in place, so
   *  the creator can unpause it. */
  is_active: boolean;
};

export type EditorSection = {
  id: string;
  /** A 'packages' section holds no links and cannot be added or removed: the
   *  creator gets exactly one, and the editor only positions and styles it. */
  kind: SectionKind;
  title: string;
  collapsible: boolean;
  default_open: boolean;
  links: EditorLink[];
};

export type EditorState = {
  sections: EditorSection[];
  /**
   * The loose-links bucket: the section the big "Add" button writes into, and
   * the one the editor renders WITHOUT collection chrome.
   *
   * Creators think in "links" and, optionally, "collections of links" — they do
   * not think in sections. The model only has sections, so one of them has to
   * play the part of "not in a collection". That is this one.
   *
   * Identified by id, not by position: it is picked once at load (the first
   * links section, which is what handle_new_user and 0002's backfill create)
   * and then it stays that row forever, so dragging a collection above it
   * cannot silently promote a different section into the role.
   *
   * Null when the creator has no links section at all — possible for anyone who
   * deleted theirs in the old editor. addQuickLink mints one on demand.
   */
  bucketId: string | null;
  theme: string;
  config: ThemeConfig;
  dirty: boolean;
};

export type EditorAction =
  | { type: "addSection" }
  | { type: "addQuickLink" }
  | { type: "removeSection"; sectionId: string }
  | { type: "setSectionTitle"; sectionId: string; title: string }
  | { type: "setCollapsible"; sectionId: string; value: boolean }
  | { type: "setDefaultOpen"; sectionId: string; value: boolean }
  | { type: "reorderSections"; ids: string[] }
  | { type: "moveSection"; sectionId: string; delta: number }
  | { type: "addLink"; sectionId: string }
  | { type: "removeLink"; sectionId: string; linkId: string }
  | {
      type: "setLinkField";
      sectionId: string;
      linkId: string;
      field: "title" | "url";
      value: string;
    }
  | { type: "toggleLink"; sectionId: string; linkId: string; value: boolean }
  | { type: "reorderLinks"; groups: Record<string, string[]> }
  | { type: "moveLink"; sectionId: string; linkId: string; delta: number }
  | { type: "moveLinkToSection"; fromId: string; toId: string; linkId: string }
  | { type: "setTheme"; theme: string }
  | { type: "setFont"; font: PageFontKey }
  | { type: "setAccent"; accent: string | undefined }
  | { type: "saved" };

/** Client-minted so a new row has a stable id the moment it appears: dnd needs
 *  ids that survive reorder, and index keys make items swap content mid-drag.
 *  Only ever called from event handlers or lazy initialisers, never in render,
 *  so it cannot cause a hydration mismatch. */
export function newId() {
  return crypto.randomUUID();
}

export function initEditorState(
  sections: PageSection[],
  theme: string,
  config: ThemeConfig,
): EditorState {
  return {
    sections: sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title ?? "",
      collapsible: s.collapsible,
      default_open: s.default_open,
      links: s.links.map((l) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        is_active: l.is_active,
      })),
    })),
    // See EditorState.bucketId. First in STORED order, which for all but a
    // hand-edited profile is the untitled section every account is created
    // with.
    bucketId: sections.find((s) => s.kind === "links")?.id ?? null,
    theme,
    config,
    dirty: false,
  };
}

function mapSection(
  state: EditorState,
  sectionId: string,
  fn: (s: EditorSection) => EditorSection,
): EditorState {
  return {
    ...state,
    dirty: true,
    sections: state.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
  };
}

function shift<T>(arr: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "addSection":
      return {
        ...state,
        dirty: true,
        sections: [
          ...state.sections,
          {
            id: newId(),
            kind: "links",
            title: "",
            collapsible: false,
            default_open: true,
            links: [],
          },
        ],
      };

    /**
     * The big "Add" button: a link, with no collection to put it in first.
     *
     * Prepended, not appended: the button sits directly above this list, and a
     * new empty row appearing under the fold — below however many links the
     * creator already has — reads as nothing happening.
     */
    case "addQuickLink": {
      const link: EditorLink = {
        id: newId(),
        title: "",
        url: "",
        is_active: true,
      };
      const bucket = state.sections.find(
        (s) => s.id === state.bucketId && s.kind === "links",
      );

      if (bucket) {
        return mapSection(state, bucket.id, (s) => ({
          ...s,
          links: [link, ...s.links],
        }));
      }

      // No bucket to write into. Mint one and remember it, or the next click
      // mints a second.
      const id = newId();
      return {
        ...state,
        dirty: true,
        bucketId: id,
        sections: [
          {
            id,
            kind: "links",
            title: "",
            collapsible: false,
            default_open: true,
            links: [link],
          },
          ...state.sections,
        ],
      };
    }

    case "removeSection": {
      // The packages section is not the creator's to delete: it is the only
      // thing that positions their packages, and losing it would drop the
      // packages off the page entirely. The UI renders no delete button for it;
      // this is the reducer refusing to be the weak link.
      const target = state.sections.find((s) => s.id === action.sectionId);
      if (!target || target.kind === "packages") return state;
      return {
        ...state,
        dirty: true,
        // The bucket has no delete button either, but if it ever goes, the id
        // must go with it — a bucketId pointing at a removed section would send
        // the next quick-add into a section that is not on the page.
        bucketId: state.bucketId === action.sectionId ? null : state.bucketId,
        sections: state.sections.filter((s) => s.id !== action.sectionId),
      };
    }

    case "setSectionTitle":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        title: action.title,
      }));

    case "setCollapsible":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        collapsible: action.value,
      }));

    case "setDefaultOpen":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        default_open: action.value,
      }));

    case "reorderSections": {
      const by = new Map(state.sections.map((s) => [s.id, s]));
      const next = action.ids
        .map((id) => by.get(id))
        .filter((s): s is EditorSection => Boolean(s));
      // Guard: if the id list ever disagrees with state, keep state rather than
      // silently dropping a section.
      if (next.length !== state.sections.length) return state;
      return { ...state, dirty: true, sections: next };
    }

    case "moveSection": {
      const i = state.sections.findIndex((s) => s.id === action.sectionId);
      const next = shift(state.sections, i, action.delta);
      if (next === state.sections) return state;
      return { ...state, dirty: true, sections: next };
    }

    // Appended, where addQuickLink prepends: this action's button sits at the
    // BOTTOM of a collection card, so the new row still lands next to the
    // control that made it.
    case "addLink":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        links: [...s.links, { id: newId(), title: "", url: "", is_active: true }],
      }));

    case "toggleLink":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        links: s.links.map((l) =>
          l.id === action.linkId ? { ...l, is_active: action.value } : l,
        ),
      }));

    case "removeLink":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        links: s.links.filter((l) => l.id !== action.linkId),
      }));

    case "setLinkField":
      return mapSection(state, action.sectionId, (s) => ({
        ...s,
        links: s.links.map((l) =>
          l.id === action.linkId ? { ...l, [action.field]: action.value } : l,
        ),
      }));

    case "reorderLinks": {
      const all = new Map<string, EditorLink>();
      for (const s of state.sections) for (const l of s.links) all.set(l.id, l);
      return {
        ...state,
        dirty: true,
        // Only sections the drag actually reported are rewritten. Motivated: a
        // `groups[s.id] ?? []` fallback would silently EMPTY any section
        // missing from the payload, and the packages section is always missing
        // from it — it registers no link droppable.
        sections: state.sections.map((s) =>
          s.id in action.groups
            ? {
                ...s,
                links: action.groups[s.id]
                  .map((id) => all.get(id))
                  .filter((l): l is EditorLink => Boolean(l)),
              }
            : s,
        ),
      };
    }

    case "moveLink": {
      const section = state.sections.find((s) => s.id === action.sectionId);
      if (!section) return state;
      const i = section.links.findIndex((l) => l.id === action.linkId);
      const next = shift(section.links, i, action.delta);
      if (next === section.links) return state;
      return mapSection(state, action.sectionId, (s) => ({ ...s, links: next }));
    }

    case "moveLinkToSection": {
      const from = state.sections.find((s) => s.id === action.fromId);
      const to = state.sections.find((s) => s.id === action.toId);
      const link = from?.links.find((l) => l.id === action.linkId);
      if (!from || !to || !link || action.fromId === action.toId) return state;
      // A packages section has nowhere to put a link. The "Move to…" select
      // does not offer it; this makes that a rule rather than an omission.
      if (to.kind !== "links") return state;
      return {
        ...state,
        dirty: true,
        sections: state.sections.map((s) => {
          if (s.id === action.fromId)
            return { ...s, links: s.links.filter((l) => l.id !== link.id) };
          if (s.id === action.toId) return { ...s, links: [...s.links, link] };
          return s;
        }),
      };
    }

    case "setTheme":
      return { ...state, dirty: true, theme: action.theme };

    case "setFont":
      return {
        ...state,
        dirty: true,
        config: { ...state.config, font: action.font },
      };

    case "setAccent":
      return {
        ...state,
        dirty: true,
        config: { ...state.config, accent: action.accent },
      };

    case "saved":
      return { ...state, dirty: false };
  }
}

/** What the server action receives. Empty rows are dropped here rather than
 *  failing validation, matching how ProfileForm filters blank links. */
export function serializeSections(sections: EditorSection[]) {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title.trim() || null,
    collapsible: s.collapsible,
    default_open: s.default_open,
    // A packages section never carries links, whatever state says.
    links:
      s.kind === "packages"
        ? []
        : s.links
            .filter((l) => l.title.trim() && l.url.trim())
            .map((l) => ({
              title: l.title,
              url: l.url,
              is_active: l.is_active,
            })),
  }));
}
