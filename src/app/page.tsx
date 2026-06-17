import Link from "next/link";

const steps = [
  {
    title: "Paste your text",
    body: "Drop in notes, an outline, or a paragraph — anything you want to visualize.",
  },
  {
    title: "Generate",
    body: "AI proposes multiple editable visuals: flowcharts, mind maps, charts, and more.",
  },
  {
    title: "Polish",
    body: "Tweak colors, text, layout, and individual elements on an interactive canvas.",
  },
  {
    title: "Export & share",
    body: "Download as PNG, SVG, PDF, or PPTX, or share a read-only link with your team.",
  },
];

const useCases = [
  {
    icon: "📊",
    title: "Presentations",
    body: "Turn talking points into clean diagrams and drop them straight onto your slides.",
  },
  {
    icon: "✍️",
    title: "Blog posts",
    body: "Explain complex ideas with custom visuals that make long-form writing click.",
  },
  {
    icon: "📱",
    title: "Social media",
    body: "Create scroll-stopping infographics sized for every feed in just a few clicks.",
  },
  {
    icon: "📚",
    title: "Documentation",
    body: "Keep flows, architectures, and processes clear with always-editable diagrams.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <section className="flex w-full flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
        <span className="rounded-full border border-black/10 px-3 py-1 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-300">
          Napkin Clone — Text to Visuals
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-zinc-50">
          Turn text into visuals in seconds
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Paste your text and let AI generate editable flowcharts, mind maps,
          infographics, charts, and concept diagrams — then customize, export,
          and collaborate.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-base font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Get Started Free
          </Link>
          <Link
            href="#how-it-works"
            className="flex h-12 items-center justify-center rounded-full border border-black/10 px-6 text-base font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            See how it works
          </Link>
        </div>

        <div className="mt-10 w-full max-w-4xl">
          <HeroPreview />
        </div>
      </section>

      <section
        id="how-it-works"
        className="w-full scroll-mt-20 border-t border-black/[.06] bg-white px-6 py-20 sm:py-24 dark:border-white/[.08] dark:bg-zinc-950"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            How it works
          </h2>
          <p className="max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            From rough notes to a polished visual in four quick steps.
          </p>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-black/[.06] bg-zinc-50 p-5 text-left dark:border-white/[.08] dark:bg-black"
            >
              <span className="text-sm font-semibold text-zinc-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {step.title}
              </h3>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="use-cases"
        className="w-full scroll-mt-20 border-t border-black/[.06] px-6 py-20 sm:py-24 dark:border-white/[.08]"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Use cases
          </h2>
          <p className="max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            One source text, visuals for everywhere you share ideas.
          </p>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((useCase) => (
            <div
              key={useCase.title}
              className="flex flex-col gap-3 rounded-xl border border-black/[.06] bg-white p-6 text-left dark:border-white/[.08] dark:bg-zinc-950"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-100 text-2xl dark:bg-zinc-900"
              >
                {useCase.icon}
              </span>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {useCase.title}
              </h3>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {useCase.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full border-t border-black/[.06] bg-white px-6 py-20 sm:py-24 dark:border-white/[.08] dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Ready to visualize your ideas?
          </h2>
          <p className="max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Sign up free and turn your first block of text into a visual in
            under a minute.
          </p>
          <Link
            href="/signup"
            className="flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-base font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      <footer className="w-full border-t border-black/[.06] px-6 py-8 text-center text-sm text-zinc-500 dark:border-white/[.08]">
        © {new Date().getFullYear()} Napkin Clone. Turn text into visuals.
      </footer>
    </main>
  );
}

function HeroPreview() {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-black/[.06] bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6 dark:border-white/[.08] dark:bg-zinc-950">
      <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-5 text-left dark:bg-black">
        <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Your text
        </span>
        <div className="space-y-2">
          <div className="h-3 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-5 text-left dark:bg-black">
        <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Your visual
        </span>
        <svg
          viewBox="0 0 240 150"
          role="img"
          aria-label="Example flowchart generated from text"
          className="h-full w-full"
        >
          <rect
            x="86"
            y="10"
            width="68"
            height="30"
            rx="8"
            className="fill-zinc-900 dark:fill-white"
          />
          <rect
            x="20"
            y="80"
            width="68"
            height="30"
            rx="8"
            className="fill-zinc-300 dark:fill-zinc-700"
          />
          <rect
            x="152"
            y="80"
            width="68"
            height="30"
            rx="8"
            className="fill-zinc-300 dark:fill-zinc-700"
          />
          <path
            d="M120 40 L120 60 L54 60 L54 80"
            className="stroke-zinc-400 dark:stroke-zinc-600"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M120 40 L120 60 L186 60 L186 80"
            className="stroke-zinc-400 dark:stroke-zinc-600"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}
