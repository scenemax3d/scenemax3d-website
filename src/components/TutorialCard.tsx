import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Tutorial } from '../types/content'
import { getTutorialPreviewImage } from '../utils/content'
import { DifficultyBadge } from './DifficultyBadge'
import { icons } from './icons'

interface TutorialCardProps {
  onOpen?: (snapshotAnchor: TutorialCardSnapshotAnchor) => void
  tutorial: Tutorial
}

export interface TutorialCardSnapshotAnchor {
  slug: string
  top: number
}

export function TutorialCard({ onOpen, tutorial }: TutorialCardProps) {
  const PlayIcon = icons.play
  const previewImage = getTutorialPreviewImage(tutorial)

  function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    onOpen?.({
      slug: tutorial.slug,
      top: event.currentTarget.getBoundingClientRect().top,
    })
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-white/[0.07]">
      <Link
        className="block focus:outline-none focus:ring-2 focus:ring-cyan-300"
        onAuxClick={handleOpen}
        onClick={handleOpen}
        to={`/tutorials/${tutorial.slug}`}
      >
        <div className="relative aspect-video overflow-hidden bg-[linear-gradient(135deg,rgba(34,211,238,0.26),rgba(168,85,247,0.2)_48%,rgba(52,211,153,0.22))]">
          {previewImage ? (
            <img
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.88] transition duration-500 group-hover:scale-[1.03]"
              draggable="false"
              loading="lazy"
              src={previewImage}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.34)_46%,rgba(2,6,23,0.74)),linear-gradient(135deg,rgba(34,211,238,0.2),rgba(168,85,247,0.16)_48%,rgba(52,211,153,0.2))]" />
          {!previewImage ? (
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
          ) : null}
          <div className="absolute left-4 right-4 top-4 rounded-md border border-white/15 bg-slate-950/78 px-3 py-2 backdrop-blur">
            <h3 className="line-clamp-2 text-base font-black leading-tight text-white md:text-lg">
              {tutorial.title}
            </h3>
          </div>
          <div className="absolute bottom-4 left-4 right-4 rounded-md border border-white/15 bg-slate-950/70 p-3 backdrop-blur">
            <div className="mb-2 h-2 w-20 rounded bg-cyan-200/50" />
            <div className="h-2 rounded bg-white/20" />
          </div>
          <div className="absolute left-1/2 top-[55%] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/70 bg-cyan-200/20 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.45)]">
            <PlayIcon aria-hidden="true" size={24} />
          </div>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={tutorial.difficulty} />
          <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
            {tutorial.duration}
          </span>
        </div>
        <p className="mt-1 flex-1 rounded-md border border-white/10 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">
          <span className="font-semibold text-slate-200">Clip focus:</span> {tutorial.clipFocus}
        </p>
      </div>
    </article>
  )
}
