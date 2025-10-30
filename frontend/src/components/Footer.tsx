export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white/60 backdrop-blur-sm py-8 text-center text-sm text-slate-600">
      <div className="mb-3 text-base font-medium tracking-wide text-[#00bba7]">
        SPEWN • Salary sorted, mind at ease.
      </div>

      <div className="flex justify-center gap-6 mt-4 text-slate-500">
        <a
          href="https://www.linkedin.com/in/akshatgoyal1105"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-[#00bba7]"
        >
          LinkedIn
        </a>
        <a
          href="https://github.com/AkshatGoyal621"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-[#00bba7]"
        >
          GitHub
        </a>
        <a
          href="https://akshats-portfolio.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-[#00bba7]"
        >
          Portfolio
        </a>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        © {new Date().getFullYear()} <span className="font-medium text-slate-600">Akshat Goyal</span>. All rights reserved.
      </div>

      <div className="mt-3 text-[11px] italic text-slate-400">
        (and no, you don’t have to subscribe to my YouTube channel… yet 😉)
      </div>
    </footer>
  );
}
