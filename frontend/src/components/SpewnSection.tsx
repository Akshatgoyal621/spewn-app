import { useDeviceType } from "@/utils/useDeviceType";
import React from "react";

type Card = {
  key: string;
  letter: string;
  title: string;
  desc: string;
  colorClass: string; // Tailwind text/color class for accent
  ariaLabel?: string;
};

const CARDS: Card[] = [
  {
    key: "s",
    letter: "S",
    title: "Savings",
    desc:
      "Your future’s foundation. Set aside a part of your income before anything else — your safety net and growth fund. SPEWN helps ensure future-you always thanks present-you.",
    colorClass: "from-indigo-400 to-indigo-600",
    ariaLabel: "Savings: future foundation",
  },
  {
    key: "p",
    letter: "P",
    title: "Parents / Preserve",
    desc:
      "If you support your parents, this is their share. If not, move it to Preserve — a quiet corner of your balance you don’t touch. Learn to live on less than you earn; it protects you when raises stall.",
    colorClass: "from-pink-400 to-pink-600",
    ariaLabel: "Parents or Preserve",
  },
  {
    key: "e",
    letter: "E",
    title: "Extras / Buffer",
    desc:
      "Life’s cushion. For surprises — the joyful and the rough. Extras protect your peace without shaking your stability. Make room for spontaneity and security.",
    colorClass: "from-amber-400 to-amber-600",
    ariaLabel: "Extras and Buffer",
  },
  {
    key: "w",
    letter: "W",
    title: "Wants",
    desc:
      "Your reward zone. Intentionally budget for treats — gadgets, trips, small luxuries — so indulgence is guilt-free and purposeful.",
    colorClass: "from-emerald-400 to-emerald-600",
    ariaLabel: "Wants: reward zone",
  },
  {
    key: "n",
    letter: "N",
    title: "Needs",
    desc:
      "The essentials — rent, food, transport. Track them to discover your true cost of living and separate necessity from habit.",
    colorClass: "from-sky-400 to-sky-600",
    ariaLabel: "Needs: essentials",
  },
];

/**
 * SpewnSection
 *  - responsive: cards switch from column (mobile) to wrapped rows (md+)
 *  - fixed container height (default 32rem) so cards wrap/scroll inside only
 *  - exposes `height` prop (string) if you want to control container height (e.g. "28rem")
 */
export default function SpewnSection({
  className,
  height = "42.5rem",
}: {
  className?: string;
  height?: string; // any valid CSS height string, e.g. '28rem' or '480px'
}) {
    const {isMobile} = useDeviceType();
  return (
    <section
      className={`mx-auto ${className ?? ""}`}
      aria-labelledby="spewn-heading"
    >
      <div
        className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-6 shadow-lg"
        style={{ height: isMobile ? "100%" : height }}
      >
        <header className="text-center">
          <h2
            id="spewn-heading"
            className="mb-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900"
            style={{ color: "#00bba7" }}
          >
            SPEWN — Your Smart Salary System
          </h2>
          <p className="mx-auto max-w-2xl text-sm sm:text-base text-gray-600">
            A balanced preset that divides income into five purposeful parts: plan, preserve, and
            live with peace.
          </p>
        </header>

        {/*
          Wrapper behaviour:
          - Uses flex + wrap so cards will flow into rows on md+ and stack as column on small screens
          - Overflow-auto ensures content stays inside the fixed-height container; users can scroll if there
            are more rows than fit the height.
        */}
        <div className="mt-6 h-[calc(100%-6.5rem)]">
          <div className="h-full w-full overflow-auto">
            <div className="flex flex-wrap items-start justify-start gap-4 p-2">
              {CARDS.map((c) => (
                <article
                  key={c.key}
                  className={`flex flex-col justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2`}
                  aria-label={c.ariaLabel}
                  tabIndex={0}
                  // responsive widths: full on xs, half on sm, third on lg
                  style={{
                    // flex-basis responsive behaviour via inline style + media queries isn't possible here —
                    // instead we use Tailwind utility classes by applying className variants. To keep
                    // the file self-contained, we provide a set of utility width classes below.
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Accent stripe */}
                    <div
                      className={`hidden sm:block h-12 w-2 rounded ${c.colorClass} bg-gradient-to-br`}
                      aria-hidden="true"
                    />

                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{c.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Tip: automate this split</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        {/*
          A small note on responsive sizing and how to control per-card widths:
          - If you prefer exact breakpoints for card widths (eg. 1-per-row on xs, 2-per-row on sm, 3-per-row on lg),
            replace the article element's className above with the variations below:

          Example classes to swap in place of the article className (choose one):

          // 1 per row xs, 2 per row sm, 3 per row lg
          'flex flex-col justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 w-full sm:w-1/2 lg:w-1/3'

          // 1 per row xs, 3 per row md, 5 per row xl
          'flex flex-col justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 w-full md:w-1/3 xl:w-1/5'

          Replacing the article class with one of the above gives predictable columns while still enforcing the fixed container height.
        */}
      </div>
    </section>
  );
}
