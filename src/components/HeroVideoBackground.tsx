import { useEffect, useMemo, useState } from 'react'

interface HeroVideoBackgroundProps {
  className?: string
}

interface VideoClip {
  id: string
  title: string
}

interface ActiveClip extends VideoClip {
  duration: number
  start: number
  token: number
}

const clips: VideoClip[] = [
  { id: 'dSj0fwh3dvQ', title: 'SceneMax3D background clip 1' },
  { id: '3ZUfoWsocKI', title: 'SceneMax3D background clip 2' },
  { id: 'Mcqx90gVmlQ', title: 'SceneMax3D background clip 3' },
  { id: '06D1fCFHIFI', title: 'SceneMax3D background clip 4' },
  { id: '2MMvcBqJ4DQ', title: 'SceneMax3D background clip 5' },
  { id: 'mZEU1rcWDCc', title: 'SceneMax3D background clip 6' },
]

const minClipDuration = 7000
const maxClipDuration = 11500
const maxRandomStart = 72

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickClip(previousId?: string): ActiveClip {
  const availableClips = clips.length > 1 ? clips.filter((clip) => clip.id !== previousId) : clips
  const clip = availableClips[randomInteger(0, availableClips.length - 1)]
  const duration = randomInteger(minClipDuration, maxClipDuration)
  const start = randomInteger(0, maxRandomStart)

  return {
    ...clip,
    duration,
    start,
    token: Date.now() + Math.random(),
  }
}

export function HeroVideoBackground({ className = '' }: HeroVideoBackgroundProps) {
  const [activeClip, setActiveClip] = useState(() => pickClip())
  const clipSeconds = Math.ceil(activeClip.duration / 1000)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setActiveClip((currentClip) => pickClip(currentClip.id))
    }, activeClip.duration)

    return () => window.clearTimeout(timeout)
  }, [activeClip.duration, activeClip.id, activeClip.token])

  const videoSrc = useMemo(() => {
    const params = new URLSearchParams({
      autoplay: '1',
      controls: '0',
      disablekb: '1',
      end: String(activeClip.start + clipSeconds),
      fs: '0',
      iv_load_policy: '3',
      loop: '1',
      modestbranding: '1',
      mute: '1',
      playlist: activeClip.id,
      playsinline: '1',
      rel: '0',
      start: String(activeClip.start),
    })

    return `https://www.youtube.com/embed/${activeClip.id}?${params.toString()}`
  }, [activeClip.id, activeClip.start, clipSeconds])

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <iframe
        allow="autoplay; encrypted-media; picture-in-picture; web-share"
        className="hero-video-background-frame absolute left-1/2 top-1/2 h-[120%] w-[220vh] min-w-full max-w-none border-0 opacity-[0.35] md:h-[130%]"
        key={activeClip.token}
        referrerPolicy="strict-origin-when-cross-origin"
        src={videoSrc}
        tabIndex={-1}
        title={activeClip.title}
      />
      <div className="absolute inset-0 bg-slate-950/65" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_78%_42%,rgba(16,185,129,0.13),transparent_32%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-slate-950" />
    </div>
  )
}
