import { Card } from "@/components/ui";
import { getLinks } from "@/lib/data";


export default async function LinksPage() {
  const links = await getLinks();
  const categories = [...new Set(links.map((l) => l.category))];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Links</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Projects and ledgers. Private repos stay private; cards without a URL
          point at local or invite-only places.
        </p>
      </div>
      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            {category}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {links
              .filter((l) => l.category === category)
              .map((l) => {
                const inner = (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">{l.name}</h3>
                      {l.url ? (
                        <span className="text-xs text-sky-400">Open</span>
                      ) : (
                        <span className="text-xs text-zinc-500">No public URL</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">{l.description}</p>
                    {l.url ? (
                      <p className="mt-3 truncate text-xs text-zinc-500">{l.url}</p>
                    ) : null}
                  </>
                );
                return l.url ? (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-zinc-600"
                  >
                    {inner}
                  </a>
                ) : (
                  <Card key={l.id}>{inner}</Card>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
