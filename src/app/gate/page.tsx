import { BRAND } from "@/lib/brand";

// Access gate. Plain page outside the (hq) shell: no sidebar, no data.
// Posts to /api/gate which sets the access cookie (iframe-safe, see middleware).
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8">
        <div className="mb-6 text-center">
          <div className="font-display text-2xl tracking-display text-fg">{BRAND.name}</div>
          <div className="mt-1 text-sm text-fg-dim">Team access</div>
        </div>
        <form method="POST" action="/api/gate" className="space-y-3">
          <input type="hidden" name="from" value={from ?? "/dashboard"} />
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Access password"
            className="w-full rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          {error ? (
            <p className="text-sm text-danger">Wrong password. Try again.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-control bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-deep"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
