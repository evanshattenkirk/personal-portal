import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}
    >
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const chipStyles: Record<string, string> = {
  booked: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  researching: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  planning: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  completed: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  open: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  watching: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  hotel: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  flight: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  car: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  activity: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  other: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export function Chip({ label }: { label: string }) {
  const style = chipStyles[label] ?? chipStyles.other;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${style}`}
    >
      {label}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[11px] tracking-widest text-zinc-500 uppercase">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-100">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-400">{sub}</div> : null}
    </div>
  );
}
