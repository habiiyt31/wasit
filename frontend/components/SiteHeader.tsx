"use client";

import Link from "next/link";
import { Logo, Wordmark } from "./Logo";
import { ConnectButton } from "./ConnectButton";

export function SiteHeader({ back = false }: { back?: boolean }) {
  return (
    <>
      <header className="mx-auto flex max-w-[1080px] items-center justify-between gap-f3 px-f3 py-f3">
        {/* Left: back button (if any) + logo */}
        <div className="flex items-center gap-f2">
          <Link href="/" className="flex items-center gap-f2" aria-label="Wasit home">
            <Logo size={back ? 28 : 36} />
            <Wordmark className={back ? "text-[16px]" : "text-[20px]"} />
          </Link>
          {back && (
            <span className="select-none text-muted">/</span>
          )}
          {back && (
            <Link
              href="/"
              className="text-xs font-semibold text-muted transition-colors hover:text-pitch"
            >
              ← Back
            </Link>
          )}
        </div>

        {/* Right: nav + wallet */}
        <div className="flex items-center gap-f3">
          <Link
            href="/arbiter"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-pitch sm:block"
          >
            Become an arbiter
          </Link>
          <ConnectButton />
        </div>
      </header>
      <hr className="chalkline" />
    </>
  );
}
