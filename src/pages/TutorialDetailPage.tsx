import { useEffect, useLayoutEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { SceneMaxCodeBlock } from '../components/SceneMaxCodeBlock'
import { TutorialCard } from '../components/TutorialCard'
import { TutorialScriptPlayer } from '../components/TutorialScriptPlayer'
import type { TutorialCodeSample } from '../types/content'
import {
  findTutorialBySlug,
  getCategoryTitle,
  getRelatedTutorials,
  getSubcategoryTitle,
  getTutorialScript,
  getTutorialNeighbors,
  siteContent,
} from '../utils/content'
import { usePageMeta } from '../utils/meta'

export function TutorialDetailPage() {
  const { slug } = useParams()
  const tutorial = findTutorialBySlug(slug)
  const [sampleState, setSampleState] = useState<
    { tutorialId: string; sample: TutorialCodeSample | undefined } | undefined
  >()

  usePageMeta(
    tutorial
      ? `${tutorial.title} | SceneMax3D Tutorial`
      : 'SceneMax3D Tutorial Not Found',
    tutorial?.description ?? siteContent.site.description,
  )

  useLayoutEffect(() => {
    if (!tutorial) return

    return scrollToAbsolutePageTop()
  }, [tutorial])

  useEffect(() => {
    if (!tutorial) return

    let isCurrent = true

    import('../content/tutorialSamples.json').then((module) => {
      if (!isCurrent) return
      const samples = module.default as Record<string, TutorialCodeSample>
      setSampleState({ tutorialId: tutorial.id, sample: samples[tutorial.id] })
    })

    return () => {
      isCurrent = false
    }
  }, [tutorial])

  if (!tutorial) {
    return <Navigate replace to="/tutorials" />
  }

  const { previous, next } = getTutorialNeighbors(tutorial)
  const related = getRelatedTutorials(tutorial)
  const sampleCode = sampleState?.tutorialId === tutorial.id ? sampleState.sample : undefined
  const tutorialScript = getTutorialScript(tutorial)

  return (
    <section className="py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Link
          className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          to="/tutorials"
        >
          Back to tutorials
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <article>
            <TutorialScriptPlayer
              autoPlay
              editUrl={`/admin/tutorials?tutorial=${encodeURIComponent(tutorial.id)}`}
              key={tutorial.id}
              scriptText={tutorialScript}
              tutorial={tutorial}
            />
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                {getCategoryTitle(tutorial.categoryId)}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-200">
                {getSubcategoryTitle(tutorial.subcategoryId)}
              </p>
              <h1 className="mt-3 text-3xl font-black leading-tight text-white md:text-5xl">
                {tutorial.title}
              </h1>
              <p className="mt-5 text-lg leading-8 text-slate-300">{tutorial.description}</p>
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.045] p-5">
                <h2 className="text-lg font-black text-white">Short clip focus</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{tutorial.clipFocus}</p>
                <p className="mt-4 text-xs text-slate-500">
                  Source: {tutorial.sourceDoc}
                  {tutorial.sourceLine ? `, line ${tutorial.sourceLine}` : ''}
                </p>
              </div>
              {sampleCode ? (
                <SceneMaxCodeBlock caption={sampleCode.caption} code={sampleCode.code} />
              ) : (
                <div className="mt-6 rounded-lg border border-cyan-300/20 bg-slate-950/70 p-5 text-sm text-slate-300">
                  Loading SceneMax3D sample code...
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={tutorial.difficulty} />
                <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  {tutorial.duration}
                </span>
                {tutorial.tags.map((tag) => (
                  <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>

          <aside className="h-fit rounded-lg border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-lg font-black text-white">Lesson navigation</h2>
            <div className="mt-4 grid gap-3">
              {previous ? (
                <Link
                  className="rounded-md border border-white/10 bg-slate-950/60 p-3 text-sm transition hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  to={`/tutorials/${previous.slug}`}
                >
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-500">Previous</span>
                  <span className="mt-1 block font-semibold text-white">{previous.title}</span>
                </Link>
              ) : null}
              {next ? (
                <Link
                  className="rounded-md border border-white/10 bg-slate-950/60 p-3 text-sm transition hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  to={`/tutorials/${next.slug}`}
                >
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-500">Next</span>
                  <span className="mt-1 block font-semibold text-white">{next.title}</span>
                </Link>
              ) : null}
            </div>
          </aside>
        </div>

        {related.length > 0 ? (
          <div className="mt-14">
            <h2 className="mb-5 text-2xl font-black text-white">Related tutorials</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <TutorialCard key={item.id} tutorial={item} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function scrollToAbsolutePageTop() {
  const root = document.documentElement
  const previousScrollBehavior = root.style.scrollBehavior

  root.style.scrollBehavior = 'auto'
  window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
  root.scrollTop = 0
  document.body.scrollTop = 0

  const frame = window.requestAnimationFrame(() => {
    window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
    root.scrollTop = 0
    document.body.scrollTop = 0
    root.style.scrollBehavior = previousScrollBehavior
  })

  return () => {
    window.cancelAnimationFrame(frame)
    root.style.scrollBehavior = previousScrollBehavior
  }
}
