"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional right-aligned detail (network, price, symbol…). */
  hint?: string;
  disabled?: boolean;
};

/* ============================================================================
   Select — a dark-themed listbox.
   ----------------------------------------------------------------------------
   Motivated: a native <select> paints its option popup from the element's own
   background-color, and every form control here is `bg-white/[0.03]`. The UA
   composites that 3%-white over ITS default white popup, then draws our
   `color: #f4f4f5` label on top — off-white on near-white, unreadable. No
   amount of `option { background }` fixes it portably (Safari and Firefox on
   macOS ignore it outright), so the list is ours to draw.

   Implements the APG select-only combobox: focus never leaves the trigger, and
   the active option is pointed at with aria-activedescendant. That is why the
   options are <li> with a mousedown preventDefault rather than buttons — they
   must never take focus, or the trigger's keyboard handling goes with it.
   ========================================================================== */

/**
 * Which colour system to paint from. `app` is the dark dashboard; `page` reads
 * the creator's --page-* tokens and is only correct inside a [data-page-theme]
 * subtree. The behaviour, the ARIA and the keyboard model are identical — this
 * splits the palette and nothing else, which is why it is a prop rather than a
 * second component.
 */
export type SelectTone = "app" | "page";

/** Palette per tone. The `page` classes live in globals.css next to .page-cta,
 *  because they need :hover and [aria-expanded] states that utilities on a
 *  conditional string can express but not as legibly. */
const TONES: Record<
  SelectTone,
  {
    trigger: string;
    triggerOpen: string;
    triggerClosed: string;
    list: string;
    option: string;
    optionActive: string;
    optionSelected: string;
    optionRest: string;
    muted: string;
    check: string;
  }
> = {
  app: {
    trigger: "rounded-xl border bg-white/[0.03] text-foreground",
    triggerOpen: "border-brand-500 bg-white/[0.05] ring-2 ring-brand-600/25",
    triggerClosed:
      "border-border hover:border-white/20 hover:bg-white/[0.05] focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-600/25",
    list: "rounded-xl border border-white/10 bg-card shadow-[0_16px_40px_-8px_rgb(0_0_0/0.7)]",
    option: "",
    optionActive: "bg-white/[0.07]",
    optionSelected: "font-medium text-brand-700",
    optionRest: "text-foreground",
    muted: "text-muted",
    check: "text-brand-600",
  },
  page: {
    trigger: "page-select",
    triggerOpen: "",
    triggerClosed: "",
    list: "page-select-list",
    option: "page-select-option",
    optionActive: "",
    optionSelected: "",
    optionRest: "",
    muted: "page-muted",
    check: "page-accent-text",
  },
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  id,
  className = "",
  disabled = false,
  size = "md",
  tone = "app",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** `sm` matches the compact editor rows; `md` matches `.input`. */
  size?: "sm" | "md";
  tone?: SelectTone;
  ariaLabel?: string;
}) {
  const t = TONES[tone];
  const generatedId = useId();
  const rootId = id ?? generatedId;
  const listId = `${rootId}-listbox`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  /** Next selectable index from `from`, clamped (no wrap) at both ends. */
  function step(from: number, delta: number) {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function edge(delta: 1 | -1) {
    const start = delta === 1 ? -1 : options.length;
    return step(start, delta);
  }

  function openList(startAt = selectedIndex >= 0 ? selectedIndex : edge(1)) {
    if (disabled || options.length === 0) return;
    setActive(startAt);
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Pointer-down outside closes. Distinct from the blur handler below: a click
  // on non-focusable chrome (the modal backdrop, plain text) never blurs the
  // trigger, so blur alone would leave the list hanging open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) e.stopPropagation(); // don't also close the surrounding modal
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Spacebar"].includes(e.key)) {
        e.preventDefault();
        openList(e.key === "ArrowUp" ? edge(-1) : undefined);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        return;
      case "Home":
        e.preventDefault();
        setActive(edge(1));
        return;
      case "End":
        e.preventDefault();
        setActive(edge(-1));
        return;
      case "Enter":
      case " ":
      case "Spacebar":
        e.preventDefault();
        commit(active);
        return;
    }

    // Typeahead: printable keys jump to the next label with that prefix.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = now - t.at > 700 ? e.key : t.buffer + e.key;
      t.at = now;

      const prefix = t.buffer.toLowerCase();
      const from = active < 0 ? 0 : active;
      // Start one past the active row so repeats of a single letter advance.
      const order = options.map((_, i) => (from + 1 + i) % options.length);
      const hit = order.find(
        (i) =>
          !options[i].disabled &&
          options[i].label.toLowerCase().startsWith(prefix),
      );
      if (hit !== undefined) setActive(hit);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={rootId}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2
          text-left outline-none transition select-none
          disabled:cursor-not-allowed disabled:opacity-40
          ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2.5 text-sm"}
          ${t.trigger}
          ${open ? t.triggerOpen : t.triggerClosed}`}
      >
        <span className={`truncate ${selected ? "" : t.muted}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {selected?.hint && (
            <span className={`text-xs ${t.muted}`}>{selected.hint}</span>
          )}
          <Chevron open={open} muted={t.muted} />
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute z-50 mt-2 max-h-64 w-full min-w-max overflow-y-auto p-1
            ${t.list}`}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                // Read by the `page` tone's CSS, which cannot see `active`.
                data-active={i === active && !option.disabled}
                // Keeps focus (and therefore the key handling) on the trigger.
                onMouseDown={(e) => e.preventDefault()}
                onPointerEnter={() => !option.disabled && setActive(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-3
                  rounded-lg transition-colors
                  ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}
                  ${option.disabled ? "cursor-not-allowed opacity-40" : ""}
                  ${t.option}
                  ${i === active && !option.disabled ? t.optionActive : ""}
                  ${isSelected ? t.optionSelected : t.optionRest}`}
              >
                <span className="truncate">{option.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {option.hint && (
                    <span className={`text-xs ${t.muted}`}>{option.hint}</span>
                  )}
                  <Check visible={isSelected} className={t.check} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chevron({ open, muted }: { open: boolean; muted: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-200 ${muted} ${
        open ? "-rotate-180" : ""
      }`}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ visible, className }: { visible: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 ${visible ? className : "invisible"}`}
    >
      <path
        d="M3 8.5l3.5 3.5L13 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
