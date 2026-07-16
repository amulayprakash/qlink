import { permanentRedirect } from "next/navigation";

/**
 * The editor IS the dashboard now, so this route is a forward.
 *
 * Kept rather than deleted: /dashboard/editor is where the editor lived for the
 * whole life of the product, so it is in creators' history and bookmarks, and
 * a 404 is a worse answer than the page they wanted.
 *
 * permanentRedirect, not redirect: this is a 308, so browsers and crawlers stop
 * asking. The move is not conditional and will not be reversed.
 */
export default function EditorPage() {
  permanentRedirect("/dashboard");
}
