import { permanentRedirect } from "next/navigation";

/**
 * The profile form moved into the editor, as the "Title and bio" modal.
 *
 * Kept as a forward rather than deleted: this route was linked from the old
 * Overview page and the dashboard nav for the whole life of the product, so it
 * is in creators' history and bookmarks.
 *
 * Everything it did — display name, bio, avatar — the modal now does, without
 * the navigation away from the page being edited. ProfileForm itself is still
 * very much alive: onboarding uses it, links and all.
 */
export default function DashboardProfile() {
  permanentRedirect("/dashboard");
}
