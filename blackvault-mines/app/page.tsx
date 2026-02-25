import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-semibold">BlackVault Mines</h1>
      <p className="text-slate-300">Production-grade provably fair mines experience.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/games/mines"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 font-medium text-emerald-300"
        >
          Open Mines
        </Link>
        <Link
          href="/games/dice"
          className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 font-medium text-cyan-200"
        >
          Open Dice Rush
        </Link>
      </div>
    </main>
  );
}
