import React from 'react';

interface LandingPageProps {
  onStart: () => void;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const font = { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" } as const;

  return (
    <div
      className="min-h-screen bg-white text-gray-900 antialiased [scroll-behavior:smooth]"
      style={font}
    >
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-gray-200 bg-white/80 px-0 py-6 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6">
          <div className="text-xl font-extrabold tracking-tight text-blue-600">RentSense AI</div>
          <button
            type="button"
            onClick={() => scrollToId('app')}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:-translate-y-px hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30"
          >
            Analyze Now
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-6">
        <section className="pb-20 pt-40 text-center md:pt-44">
          <h1 className="mx-auto mb-6 max-w-[800px] text-4xl font-extrabold leading-[1.1] tracking-tight md:text-[56px]">
            Understand Your Rental Contract Instantly
          </h1>
          <p className="mx-auto mb-10 max-w-[600px] text-lg leading-relaxed text-gray-600 md:text-xl">
            Upload your lease. Get clear answers about rent, deposit, risks, and key terms in seconds.
          </p>
          <button
            type="button"
            onClick={() => scrollToId('app')}
            className="inline-block rounded-lg bg-blue-600 px-8 py-3.5 font-semibold text-white shadow-md shadow-blue-600/20 transition hover:-translate-y-px hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30"
          >
            Try Free Analysis
          </button>

          <div className="relative mx-auto mt-16 max-w-[900px] rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 p-3 shadow-2xl shadow-black/10">
            <div className="flex aspect-[16/10] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                <span className="ml-2 text-[11px] font-semibold text-gray-500">Contract Analysis Dashboard</span>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-5 p-6 md:grid-cols-[2fr_1fr]">
                <div className="min-h-0">
                  <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                      Detected Key Terms
                    </div>
                    <div className="mb-2.5 h-2 w-[70%] rounded bg-blue-50" />
                    <div className="mb-2.5 h-2 w-[40%] rounded bg-gray-200" />
                    <div className="mb-2.5 h-2 w-[70%] rounded bg-blue-50" />
                    <div className="mb-2.5 h-2 w-[70%] rounded bg-gray-200" />
                    <div className="mb-2.5 h-2 w-[40%] rounded bg-blue-50" />
                    <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <div className="mb-1 text-[10px] font-extrabold text-amber-900">RISK DETECTED</div>
                      <div className="h-2 w-[90%] rounded bg-amber-300" />
                    </div>
                  </div>
                </div>
                <div className="hidden min-h-0 flex-col gap-3 md:flex">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Monthly Rent</div>
                    <div className="text-xl font-extrabold text-gray-900">€1,280.00</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Notice Period</div>
                    <div className="text-base font-semibold text-gray-900">3 Months</div>
                  </div>
                  <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Q&amp;A Chat</div>
                    <div className="mt-2 text-[10px] text-gray-400">Ask about utilities...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 md:py-[100px]" id="features">
          <h2 className="mb-14 text-center text-3xl font-extrabold tracking-tight md:mb-16 md:text-[32px]">
            Everything you need to sign with confidence
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
            {[
              {
                icon: '📄',
                title: 'AI Contract Breakdown',
                body: "Our AI instantly extracts monthly rent, security deposit amounts, and all critical lease dates so you don't have to hunt for them.",
              },
              {
                icon: '⚠️',
                title: 'Risk Detection',
                body: 'We highlight hidden risks, unusual clauses, or predatory terms in your lease agreement before you sign your name.',
              },
              {
                icon: '💬',
                title: 'Simple Q&A Chatbot',
                body: 'Have a specific question? Ask our chatbot "Are pets allowed?" or "Who pays for repairs?" and get answers directly from your contract.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-10 transition-colors hover:border-blue-600"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
                  {f.icon}
                </div>
                <h3 className="mb-3 text-xl font-bold">{f.title}</h3>
                <p className="text-base leading-relaxed text-gray-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 md:py-[100px]" id="how-it-works">
          <h2 className="mb-14 text-center text-3xl font-extrabold tracking-tight md:mb-16 md:text-[32px]">How It Works</h2>
          <div className="mx-auto flex max-w-[700px] flex-col gap-10">
            {[
              {
                n: '1',
                title: 'Upload PDF',
                body: 'Securely upload your digital rental contract or a clear scan of your physical document.',
              },
              {
                n: '2',
                title: 'AI Analyzes Contract',
                body: 'Our legal-trained AI processes the entire document in seconds, identifying every important detail.',
              },
              {
                n: '3',
                title: 'Get Instant Answers',
                body: 'Review your custom dashboard and chat with the document to clarify any confusing terms.',
              },
            ].map((s) => (
              <div key={s.n} className="flex gap-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
                  {s.n}
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-bold">{s.title}</h3>
                  <p className="text-gray-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 md:py-[100px]">
          <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight md:text-[32px]">
            What tenants are saying
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 italic text-gray-800">
              &quot;Saved me from missing hidden administration fees that were buried on page 14 of my lease.&quot;
              <div className="mt-4 text-sm font-semibold not-italic text-gray-600">Alex, Berlin</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 italic text-gray-800">
              &quot;Finally understood my complex contract in just minutes. The chatbot is a total game changer.&quot;
              <div className="mt-4 text-sm font-semibold not-italic text-gray-600">Sarah, Munich</div>
            </div>
          </div>
        </section>

        <section
          id="app"
          className="my-20 rounded-3xl bg-gray-900 px-6 py-24 text-center text-white md:my-24 md:py-[100px]"
        >
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight text-white md:text-[40px]">
            Stop reading complex contracts.
            <br />
            Start understanding them.
          </h2>
          <button
            type="button"
            onClick={onStart}
            className="mt-6 inline-block rounded-lg bg-white px-8 py-3.5 font-semibold text-blue-600 shadow-md transition hover:-translate-y-px hover:bg-gray-100"
          >
            Upload Your Contract
          </button>
        </section>
      </div>

      <footer className="border-t border-gray-200 py-16 text-center text-sm text-gray-600">
        <div className="mx-auto max-w-[1100px] px-6">
          <span className="mb-2 block font-bold text-gray-900">RentSense AI</span>
          <p>&copy; 2026 RentSense AI. All rights reserved.</p>
          <p className="mt-2.5 text-xs opacity-60">
            This report is AI-generated for informational purposes only and is not legal advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
