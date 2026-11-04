import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/ui";
import { SuggestionCard } from "@/components/SuggestionCard";
import {
  daysUntil,
  fmtDate,
  fmtMoney,
  fmtPoints,
  getBookings,
  getSuggestions,
  getTrip,
  isSupabaseConfigured,
} from "@/lib/data";
import { CATEGORY_META, tripTheme } from "@/lib/trip-theme";
import type {
  Booking,
  BookingKind,
  Suggestion,
  SuggestionCategory,
} from "@/lib/types";

export const instant = false; // single-user portal: render at request time

const CATEGORY_ORDER: SuggestionCategory[] = [
  "planning",
  "flight",
  "food",
  "activity",
  "stay",
];

const KIND_ICON: Record<BookingKind, string> = {
  hotel: "🏨",
  flight: "✈️",
  car: "🚗",
  activity: "🎟️",
  other: "📌",
};

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (!trip) notFound();
  const bookings = await getBookings(slug);
  const suggestions = await getSuggestions(slug);
  const interactive = isSupabaseConfigured();
  const theme = tripTheme(slug);

  const totalPaid = bookings.reduce((s, b) => s + (b.costPaid ?? 0), 0);
  const totalNet = bookings.reduce((s, b) => s + (b.costNet ?? 0), 0);
  const credits = totalPaid - totalNet;

  const bookedIdeas = suggestions.filter((s) => s.status === "booked");
  const planningIdeas = suggestions.filter((s) => s.status !== "booked");
  const savedCount = planningIdeas.filter((s) => s.status === "saved").length;

  const byCategory = new Map<SuggestionCategory, Suggestion[]>();
  for (const cat of CATEGORY_ORDER) {
    const items = planningIdeas.filter((s) => s.category === cat);
    if (items.length > 0) byCategory.set(cat, items);
  }

  const countdown = trip.startDate ? daysUntil(trip.startDate) : null;
  const countdownLabel =
    countdown == null
      ? null
      : countdown > 1
        ? `⏳ ${countdown} days to go`
        : countdown === 1
          ? "⏳ Tomorrow!"
          : countdown === 0
            ? "🎉 Starts today"
            : "Wrapped up";

  const navItems: { id: string; label: string }[] = [
    { id: "booked", label: "✅ Booked" },
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      id: `cat-${c}`,
      label: `${CATEGORY_META[c].icon} ${CATEGORY_META[c].label}`,
    })),
    { id: "trek", label: "🗓️ Itinerary" },
  ];

  return (
    <div className="space-y-8">
      <Link href="/trips" className="text-xs text-sky-400 hover:text-sky-300">
        Back to trips
      </Link>

      {/* ---------- Hero ---------- */}
      <header
        className={`rounded-2xl border border-zinc-800 bg-gradient-to-br ${theme.gradient} p-6`}
      >
        <div className="flex flex-wrap items-start gap-4">
          <div className="text-5xl" aria-hidden>
            {theme.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
              <Chip label={trip.status} />
              {countdownLabel ? (
                <span className="inline-flex items-center rounded-full border border-zinc-100/20 bg-zinc-950/40 px-3 py-1 text-xs font-semibold text-zinc-100">
                  {countdownLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-zinc-300">
              {trip.destination} · {trip.dateLabel}
              {trip.travelers ? ` · ${trip.travelers} travelers` : ""}
            </p>
            {trip.notes ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-200/90">
                {trip.notes}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-zinc-950/40 px-3 py-1.5 text-emerald-300">
            ✅ {bookings.length + bookedIdeas.length} booked
          </span>
          <span className="rounded-full bg-zinc-950/40 px-3 py-1.5 text-zinc-200">
            💡 {planningIdeas.length} ideas in planning
          </span>
          <span className="rounded-full bg-zinc-950/40 px-3 py-1.5 text-amber-300">
            ★ {savedCount} saved
          </span>
          {totalPaid > 0 ? (
            <span className="rounded-full bg-zinc-950/40 px-3 py-1.5 text-zinc-200">
              💳 {fmtMoney(totalPaid)} paid
              {credits > 0 ? (
                <span className="text-emerald-300">
                  {" "}
                  → {fmtMoney(totalNet)} net after credits
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      {/* ---------- Sticky section nav ---------- */}
      <nav className="sticky top-3 z-20 flex gap-1.5 overflow-x-auto rounded-full border border-zinc-800 bg-zinc-950/85 p-1.5 backdrop-blur">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* ---------- Booked zone ---------- */}
      <section id="booked" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-emerald-300">
            ✅ Booked &amp; confirmed
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Locked in — confirmation numbers and cancellation deadlines live
            here.
          </p>
        </div>

        {bookings.length === 0 && bookedIdeas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
            Nothing booked yet for this trip. Everything below is still just
            ideas — when you book one, mark it ✓ and it moves up here.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
            {bookedIdeas.map((s) => (
              <SuggestionCard key={s.id} s={s} interactive={interactive} />
            ))}
          </div>
        )}

        {totalPaid > 0 ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-5 py-4 text-sm">
            <span>
              <span className="text-zinc-400">Paid: </span>
              <strong>{fmtMoney(totalPaid)}</strong>
            </span>
            {credits > 0 ? (
              <span>
                <span className="text-zinc-400">Credits coming back: </span>
                <strong className="text-emerald-300">
                  −{fmtMoney(credits)}
                </strong>
              </span>
            ) : null}
            <span>
              <span className="text-zinc-400">True cost: </span>
              <strong className="text-emerald-300">{fmtMoney(totalNet)}</strong>
            </span>
          </div>
        ) : null}
      </section>

      {/* ---------- Planning zone ---------- */}
      <section className="space-y-8">
        <div className="border-t border-zinc-800 pt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold text-violet-300">
            🧭 Planning
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-zinc-500">
            Ideas only — nothing in this zone is booked. ☆ Save the keepers,
            ✓ Mark booked when you pull the trigger (it moves up to Booked),
            ✕ dismiss the rest. Changes save instantly.
          </p>
        </div>

        {planningIdeas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
            No ideas yet. Ask Muse to research this trip and the picks will
            land here.
          </div>
        ) : (
          CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => {
            const items = byCategory.get(cat)!;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat} id={`cat-${cat}`} className="scroll-mt-24">
                <h3
                  className={`mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase ${meta.text}`}
                >
                  <span aria-hidden>{meta.icon}</span> {meta.label}
                  <span className="text-zinc-500 normal-case">
                    ({items.length})
                  </span>
                </h3>
                <div
                  className={
                    cat === "planning"
                      ? "space-y-3"
                      : "grid gap-3 md:grid-cols-2"
                  }
                >
                  {items.map((s, i) => (
                    <SuggestionCard
                      key={s.id}
                      s={s}
                      interactive={interactive}
                      index={cat === "planning" ? i + 1 : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </section>

      {/* ---------- TREK ---------- */}
      <section
        id="trek"
        className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          🗓️ Day-by-day itinerary — TREK
        </h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          {slug === "seattle" ? (
            <>
              This trip is loaded in TREK (the trial instance Muse runs):
              both hotels, confirmation numbers, and cancellation terms are in
              its itinerary view. TREK is the day-by-day planner; this page is
              the summary. The trial is hosted on Muse&apos;s machine for
              now — a permanent home (VPS or Tailscale) makes it reachable
              from anywhere.
            </>
          ) : (
            <>
              This trip isn&apos;t in TREK yet. Ask Muse to load it — TREK
              holds the day-by-day itinerary while this page keeps the
              bookings, totals, and picks.
            </>
          )}
        </p>
      </section>
    </div>
  );
}

function BookingCard({ b }: { b: Booking }) {
  return (
    <article className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-xl"
            aria-hidden
          >
            {KIND_ICON[b.kind]}
          </span>
          <div>
            <h3 className="leading-snug font-semibold">{b.name}</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              via {b.provider} · {b.details}
            </p>
          </div>
        </div>
        <div className="text-right">
          {b.pointsCost ? (
            <>
              <div className="font-semibold">{fmtPoints(b.pointsCost)} pts</div>
              <div className="text-xs text-zinc-500">{b.pointsProgram}</div>
            </>
          ) : (
            <>
              <div className="font-semibold">{fmtMoney(b.costPaid)}</div>
              {b.costNet != null && b.costNet !== b.costPaid ? (
                <div className="text-xs font-medium text-emerald-300">
                  net {fmtMoney(b.costNet)} after credits
                </div>
              ) : null}
              {b.costNote ? (
                <div className="max-w-56 text-xs text-zinc-500">
                  {b.costNote}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-zinc-950/40 px-3 py-2">
          <div className="text-[11px] tracking-wider text-zinc-500 uppercase">
            Dates
          </div>
          <div className="mt-0.5 font-medium">
            {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-950/40 px-3 py-2">
          <div className="text-[11px] tracking-wider text-zinc-500 uppercase">
            Confirmation
          </div>
          <div className="mt-0.5 font-mono text-[13px] font-medium break-all">
            {b.confirmation ?? "n/a"}
          </div>
          {b.secondaryRef ? (
            <div className="font-mono text-[11px] break-all text-zinc-500">
              {b.secondaryRef}
            </div>
          ) : null}
        </div>
        <div className="rounded-lg bg-zinc-950/40 px-3 py-2">
          <div className="text-[11px] tracking-wider text-zinc-500 uppercase">
            🛡️ Free cancel until
          </div>
          <div className="mt-0.5 font-medium">{b.cancelBy ?? "n/a"}</div>
        </div>
      </div>

      {b.notes ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{b.notes}</p>
      ) : null}
    </article>
  );
}
