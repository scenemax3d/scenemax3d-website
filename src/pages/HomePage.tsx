import { Link } from 'react-router-dom'
import { CtaButton } from '../components/CtaButton'
import { EngineMockup } from '../components/EngineMockup'
import { SectionHeader } from '../components/SectionHeader'
import { TutorialCard } from '../components/TutorialCard'
import { icons, type IconName } from '../components/icons'
import { featuredTutorials, siteContent } from '../utils/content'
import { usePageMeta } from '../utils/meta'

function IconTile({ icon }: { icon: string }) {
  const Icon = icons[(icon as IconName) in icons ? (icon as IconName) : 'sparkles']

  return (
    <span className="grid h-11 w-11 place-items-center rounded-md border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
      <Icon aria-hidden="true" size={22} />
    </span>
  )
}

export function HomePage() {
  usePageMeta(
    'SceneMax3D | 3D game creation studio and tutorial academy',
    siteContent.site.description,
  )

  return (
    <>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.26em] text-cyan-200">
              {siteContent.hero.eyebrow}
            </p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
              {siteContent.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 md:text-xl md:leading-8">
              {siteContent.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {siteContent.hero.buttons.map((button) => (
                <CtaButton key={button.label} link={button} />
              ))}
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {siteContent.hero.stats.map((stat) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4" key={stat.label}>
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
          <EngineMockup />
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Built for creators"
            title="A studio that makes 3D game ideas feel reachable"
            description="SceneMax3D is designed for learning, prototyping, teaching, and shipping small complete games."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {siteContent.creatorAudiences.map((audience) => (
              <article className="rounded-lg border border-white/10 bg-slate-950/70 p-5" key={audience.title}>
                <IconTile icon={audience.icon} />
                <h3 className="mt-5 text-xl font-black text-white">{audience.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{audience.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Engine workflow"
            title="Everything starts in one visual creation loop"
            description="Design a scene, connect readable logic, preview behavior, refine feedback, and prepare a build."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {siteContent.features.map((feature) => (
              <article className="rounded-lg border border-white/10 bg-white/[0.045] p-5 transition hover:border-cyan-300/40 hover:bg-white/[0.065]" key={feature.title}>
                <IconTile icon={feature.icon} />
                <h3 className="mt-5 text-lg font-black text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-slate-900/30 py-14 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              SceneMax language
            </p>
            <h2 className="mt-3 text-3xl font-black text-white md:text-5xl">
              {siteContent.languagePreview.title}
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-300">
              {siteContent.languagePreview.description}
            </p>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-emerald-300/20 bg-[#07110d] p-5 text-sm leading-7 text-emerald-100 shadow-2xl shadow-emerald-950/30">
            <code>{siteContent.languagePreview.code}</code>
          </pre>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Tutorial academy"
            title="Learn the engine one playable idea at a time"
            description="The academy is already wired for search, filters, featured lessons, related videos, and detail pages."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {featuredTutorials.slice(0, 6).map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              to="/tutorials"
            >
              Open full tutorial academy
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Showcase"
            title="Sample games and demos will grow from the tutorial paths"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {siteContent.showcase.map((item) => (
              <article className="rounded-lg border border-white/10 bg-slate-950/70 p-5" key={item.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-200">
                  {item.status}
                </p>
                <h3 className="mt-3 text-xl font-black text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-black text-white md:text-5xl">
            Start building your first 3D game today
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Download the engine, follow the starter lessons, and turn the first scene into a complete playable loop.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {siteContent.hero.buttons.slice(0, 2).map((button) => (
              <CtaButton key={button.label} link={button} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
