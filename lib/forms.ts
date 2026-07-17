/** Shared return shape for form server actions used with useActionState. */
export type ActionState =
  | {
      error?: string;
      ok?: boolean;
      /**
       * Echo of the `signature` field the form posted, returned only on success.
       *
       * It lets a form derive "are there unsaved changes" by comparing what is
       * on screen now against what the server last confirmed, instead of keeping
       * a dirty flag that something has to remember to clear. Deriving it is not
       * tidiness: a flag has to be cleared from the action's RESULT, which means
       * an effect that calls setState, and it silently rots the moment nobody
       * clears it — see the dead `case "saved"` in the editor's reducer, which
       * is why that screen still says "Unsaved changes" after a save that
       * worked. A comparison cannot rot, and it correctly reports a page edited
       * back to its original state as clean.
       *
       * Opaque to the server: the client picks the format, the action hands the
       * same bytes back.
       */
      signature?: string;
    }
  | undefined;
