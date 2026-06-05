import { Link } from 'react-router-dom'
import { SectionHeader } from '../components/SectionHeader'
import { siteContent } from '../utils/content'
import { usePageMeta } from '../utils/meta'

interface SimplePageProps {
  title: string
  eyebrow: string
  description: string
  items: string[]
}

export function SimplePage({ description, eyebrow, items, title }: SimplePageProps) {
  usePageMeta(`${title} | ${siteContent.site.name}`, description)

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article className="rounded-lg border border-white/10 bg-white/[0.045] p-5" key={item}>
              <h2 className="text-lg font-black text-white">{item}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                This section is ready for the detailed content pass in the next phases.
              </p>
            </article>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            to="/tutorials"
          >
            Open tutorials
          </Link>
        </div>
      </div>
    </section>
  )
}
