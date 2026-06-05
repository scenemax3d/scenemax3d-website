import { icons } from './icons'

interface YouTubePlayerProps {
  youtubeId: string
  title: string
}

export function YouTubePlayer({ youtubeId, title }: YouTubePlayerProps) {
  const PlayIcon = icons.play

  if (!youtubeId) {
    return (
      <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(168,85,247,0.14),rgba(52,211,153,0.16))]">
        <div className="px-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-cyan-300/60 bg-cyan-300/10 text-cyan-100">
            <PlayIcon aria-hidden="true" size={28} />
          </div>
          <p className="text-lg font-black text-white">Tutorial video slot ready</p>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
            Add the YouTube ID in the JSON content file and this placeholder becomes a responsive embedded player.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={`https://www.youtube.com/embed/${youtubeId}`}
        title={title}
      />
    </div>
  )
}
