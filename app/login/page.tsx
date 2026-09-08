"use client";

import { Suspense, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Contours from "@/components/Contours";

function LoginCard() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-paper/10 bg-pine/40 p-8 text-center shadow-2xl shadow-pine-deep/40 backdrop-blur-sm sm:p-10">
      <span className="eyebrow text-marigold-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
        Members Only
      </span>
      <h1 className="mt-4 font-display text-4xl font-semibold">Member Login</h1>
      <p className="mt-3 text-sm text-paper/70">
        Sign in with your Berkeley email to access the member
        dashboard.
      </p>

      {error && (
        <p className="mt-5 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm text-red-100">
          That account isn&rsquo;t on the member list. If this is a mistake,
          please inform Webmaster.
        </p>
      )}

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-paper px-6 py-3.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Sign in with Google
      </button>

      <p className="mt-6 text-xs text-paper/45">
        Access is limited to registered members. Not a member?{" "}
        <a href="/apply" className="text-marigold-soft underline-offset-2 hover:underline">
          Apply to join
        </a>
        .
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden bg-pine-deep px-6 text-paper">
      <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.1} />
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </section>
  );
}
