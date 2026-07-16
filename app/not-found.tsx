import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-5 text-center">
      <div>
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-4xl font-extrabold">404</h1>
        <p className="mt-2 text-muted">
          This page doesn&apos;t exist or hasn&apos;t been published yet.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Go home
        </Link>
      </div>
    </main>
  );
}
