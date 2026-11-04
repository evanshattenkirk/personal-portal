import Link from "next/link";
import { isDemoMode } from "@/lib/data";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/trips", label: "Trips" },
  { href: "/points", label: "Points" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/links", label: "Links" },
];

export default function Nav() {
  const demo = isDemoMode();
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-bold tracking-tight text-zinc-50">
          Evan&apos;s Portal
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {demo ? (
          <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
            Demo data
          </span>
        ) : null}
      </div>
    </header>
  );
}
