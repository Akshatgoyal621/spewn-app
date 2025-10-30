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
      "Life’s cushion. For surprises — the joyful and the rough. Extras protect your peace without shaking your stability.",
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

export default function SpewnSection({ className }: { className?: string }) {
  return (
    <section
      className={`mx-auto ${className ?? ""}`}
      aria-labelledby="spewn-heading"
    >
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-8 shadow-lg">
        <header className="text-center">
          <h2 id="spewn-heading" className="mb-2 text-3xl font-extrabold tracking-tight text-gray-900" style={{color: "#00bba7"}}>
            SPEWN — Your Smart Salary System
          </h2>
          <p className="mx-auto max-w-2xl text-gray-600">
            A balanced preset that divides income into five purposeful parts: plan, preserve, and live
            with peace.
          </p>
        </header>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <article
              key={c.key}
              className="flex flex-col justify-between rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md"
              aria-label={c.ariaLabel}
              tabIndex={0}
            >
              <div className="flex items-start gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{c.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                {/* <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                  <svg
                    className="h-4 w-4 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 6v6l4 2" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  Balanced
                </span> */}

                <span className="text-xs text-gray-400">Tip: automate this split</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
