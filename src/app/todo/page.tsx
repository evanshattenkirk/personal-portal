import { Card } from "@/components/ui";
import { daysUntil, fmtDate, getTasks } from "@/lib/data";
import type { PortalTask } from "@/lib/types";

export const instant = false; // single-user portal: render at request time

const OWNER_NAME: Record<string, string> = {
  "owner:evan": "You",
  "owner:muse": "Jarvis",
  "owner:claude": "Claude Duet",
};

function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const d = daysUntil(dueDate);
  const style =
    d < 0
      ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
      : d <= 3
        ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
        : "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  const label =
    d < 0
      ? `overdue ${-d}d`
      : d === 0
        ? "due today"
        : d === 1
          ? "due tomorrow"
          : `due in ${d}d`;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${style}`}
      title={fmtDate(dueDate)}
    >
      📅 {label}
    </span>
  );
}

function TaskRow({ t, highlight }: { t: PortalTask; highlight?: boolean }) {
  return (
    <li
      className={`flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 ${
        highlight ? "bg-amber-500/[0.04]" : ""
      }`}
    >
      <a
        href={t.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300 hover:text-sky-200"
      >
        {t.externalId}
      </a>
      <div className="min-w-0 flex-1">
        <div className="leading-snug font-medium">{t.title}</div>
        {t.actionNote ? (
          <div className="mt-0.5 text-sm text-amber-200/90">
            👉 Your move: {t.actionNote}
          </div>
        ) : null}
        <div className="mt-0.5 text-xs text-zinc-500">
          {t.status}
          {t.ownerLabel
            ? ` · with ${OWNER_NAME[t.ownerLabel] ?? t.ownerLabel}`
            : ""}
        </div>
      </div>
      <DueBadge dueDate={t.dueDate} />
    </li>
  );
}

export default async function TodoPage() {
  const tasks = await getTasks();
  const needsYou = tasks.filter((t) => t.needsEvan);
  const agentsOnIt = tasks.filter((t) => !t.needsEvan);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📋 Your list</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Synced from the Linear board, filtered your way: the things that
          need <em>you</em> first — car stuff, appointments, outreach, buying
          decisions. Everything the agents are handling sits below for
          visibility. Tap a KIR chip to open the full issue.
        </p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-amber-300 uppercase">
          🙋 Needs you ({needsYou.length})
        </h2>
        {needsYou.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">
              Nothing needs you right now. 🎉
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-amber-500/25">
            <ul className="divide-y divide-zinc-800">
              {needsYou.map((t) => (
                <TaskRow key={t.id} t={t} highlight />
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-zinc-400 uppercase">
          🤖 Agents are on it ({agentsOnIt.length})
        </h2>
        {agentsOnIt.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">Nothing else open.</p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <ul className="divide-y divide-zinc-800">
              {agentsOnIt.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
