import type { SuggestionCategory } from "./types";

export interface TripTheme {
  emoji: string;
  /** Tailwind gradient stops for the trip hero banner. */
  gradient: string;
}

const THEMES: Record<string, TripTheme> = {
  seattle: {
    emoji: "🌲",
    gradient: "from-teal-500/30 via-emerald-500/10 to-sky-500/25",
  },
  cancun: {
    emoji: "🏖️",
    gradient: "from-orange-500/30 via-pink-500/10 to-amber-400/25",
  },
  "family-trip": {
    emoji: "🚢",
    gradient: "from-violet-500/30 via-fuchsia-500/10 to-sky-500/25",
  },
};

const DEFAULT_THEME: TripTheme = {
  emoji: "✈️",
  gradient: "from-sky-500/30 via-indigo-500/10 to-zinc-500/20",
};

export function tripTheme(slug: string): TripTheme {
  return THEMES[slug] ?? DEFAULT_THEME;
}

export interface CategoryMeta {
  icon: string;
  label: string;
  /** Price-pill / chip classes. */
  pill: string;
  /** Left accent bar on cards. */
  bar: string;
  /** Section heading text color. */
  text: string;
}

export const CATEGORY_META: Record<SuggestionCategory, CategoryMeta> = {
  planning: {
    icon: "🧭",
    label: "Trip Planning",
    pill: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    bar: "bg-violet-400",
    text: "text-violet-300",
  },
  flight: {
    icon: "✈️",
    label: "Flights",
    pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    bar: "bg-sky-400",
    text: "text-sky-300",
  },
  food: {
    icon: "🍽️",
    label: "Eat & Drink",
    pill: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    bar: "bg-orange-400",
    text: "text-orange-300",
  },
  activity: {
    icon: "🎟️",
    label: "Things to Do",
    pill: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    bar: "bg-pink-400",
    text: "text-pink-300",
  },
  stay: {
    icon: "🛏️",
    label: "Stays",
    pill: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    bar: "bg-teal-400",
    text: "text-teal-300",
  },
};
