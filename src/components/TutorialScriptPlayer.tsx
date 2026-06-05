import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import type { Tutorial } from '../types/content'

type TutorialPlayerSegment =
  | {
      type: 'speech'
      text: string
      duration: number
      start: number
      end: number
    }
  | {
      type: 'wait'
      duration: number
      start: number
      end: number
    }
  | {
      type: 'image'
      url: string
      duration: 0
      start: number
      end: number
    }

type TutorialPlayerSegmentDraft =
  | {
      type: 'speech'
      text: string
      duration: number
    }
  | {
      type: 'wait'
      duration: number
    }
  | {
      type: 'image'
      url: string
      duration: 0
    }

interface ParsedTutorialScript {
  segments: TutorialPlayerSegment[]
  totalDuration: number
}

interface TutorialScriptPlayerProps {
  scriptText?: string
  tutorial: Tutorial
}

const defaultImage = '/assets/warrior1.png'
const wordsPerMinute = 155

function buildDefaultTutorialScript(tutorial: Tutorial) {
  return [
    `[img: ${tutorial.thumbnail || defaultImage}]`,
    `Welcome to ${tutorial.title}. ${tutorial.description}`,
    '[wait: 1]',
    `In this lesson, focus on this: ${tutorial.clipFocus}`,
    '[wait: 1]',
    `When you are ready, use the sample below as your first working SceneMax3D version.`,
  ].join('\n')
}

export function TutorialScriptPlayer({ scriptText, tutorial }: TutorialScriptPlayerProps) {
  const script = scriptText?.trim() || tutorial.tutorialScript?.trim() || buildDefaultTutorialScript(tutorial)
  const parsedScript = useMemo(() => parseTutorialScript(script), [script])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  const currentTimeRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)
  const animationRef = useRef<number | undefined>(undefined)
  const playbackTokenRef = useRef(0)

  const activeSegment = parsedScript.segments[activeIndex]
  const activeImage = useMemo(
    () => getImageForTime(parsedScript.segments, currentTime, activeIndex),
    [activeIndex, currentTime, parsedScript.segments],
  )
  const progress = parsedScript.totalDuration > 0 ? currentTime / parsedScript.totalDuration : 0
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  const stopProgress = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    if (animationRef.current !== undefined) {
      window.cancelAnimationFrame(animationRef.current)
      animationRef.current = undefined
    }
  }, [])

  const pausePlayback = useCallback(() => {
    playbackTokenRef.current += 1
    stopProgress()
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
  }, [stopProgress])

  const setPlayerTime = useCallback((nextTime: number) => {
    currentTimeRef.current = nextTime
    setCurrentTime(nextTime)
  }, [])

  const runProgress = useCallback(
    (fromTime: number, toTime: number) => {
      const startedAt = performance.now()

      function updateProgress(now: number) {
        const elapsedSeconds = (now - startedAt) / 1000
        const nextTime = Math.min(toTime, fromTime + elapsedSeconds)
        currentTimeRef.current = nextTime
        setCurrentTime(nextTime)

        if (nextTime < toTime) {
          animationRef.current = window.requestAnimationFrame(updateProgress)
        }
      }

      animationRef.current = window.requestAnimationFrame(updateProgress)
    },
    [],
  )

  const playFromIndex = useCallback(
    function runSegment(index: number, token: number) {
      if (token !== playbackTokenRef.current) return

      const segment = parsedScript.segments[index]

      if (!segment) {
        setPlayerTime(parsedScript.totalDuration)
        setActiveIndex(Math.max(parsedScript.segments.length - 1, 0))
        setIsPlaying(false)
        stopProgress()
        return
      }

      setActiveIndex(index)

      if (segment.type === 'image') {
        setPlayerTime(segment.start)
        window.setTimeout(() => runSegment(index + 1, token), 0)
        return
      }

      const fromTime =
        currentTimeRef.current >= segment.start && currentTimeRef.current < segment.end
          ? currentTimeRef.current
          : segment.start

      setPlayerTime(fromTime)
      stopProgress()
      runProgress(fromTime, segment.end)

      let didFinishSegment = false
      const finishSegment = () => {
        if (didFinishSegment || token !== playbackTokenRef.current) return
        didFinishSegment = true
        stopProgress()
        setPlayerTime(segment.end)
        runSegment(index + 1, token)
      }

      if (segment.type === 'wait' || !canSpeak) {
        timerRef.current = window.setTimeout(
          finishSegment,
          Math.max((segment.end - fromTime) * 1000, 0),
        )
        return
      }

      const utterance = new SpeechSynthesisUtterance(segment.text)
      utterance.rate = 0.96
      utterance.pitch = 1
      utterance.onend = finishSegment
      utterance.onerror = () => {
        if (token !== playbackTokenRef.current) return
        timerRef.current = window.setTimeout(
          finishSegment,
          Math.max((segment.end - currentTimeRef.current) * 1000, 0),
        )
      }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    },
    [canSpeak, parsedScript.segments, parsedScript.totalDuration, runProgress, setPlayerTime, stopProgress],
  )

  const play = useCallback(() => {
    if (parsedScript.segments.length === 0) return

    const shouldRestart = currentTimeRef.current >= parsedScript.totalDuration
    const nextTime = shouldRestart ? 0 : currentTimeRef.current
    const index = getPlayableSegmentIndex(parsedScript.segments, nextTime)
    const token = playbackTokenRef.current + 1

    playbackTokenRef.current = token
    setIsPlaying(true)
    setPlayerTime(nextTime)
    playFromIndex(index, token)
  }, [parsedScript.segments, parsedScript.totalDuration, playFromIndex, setPlayerTime])

  const seekTo = useCallback(
    (nextTime: number, shouldResume = isPlaying) => {
      const clampedTime = clamp(nextTime, 0, parsedScript.totalDuration)
      const nextIndex = getPlayableSegmentIndex(parsedScript.segments, clampedTime)

      playbackTokenRef.current += 1
      stopProgress()
      window.speechSynthesis?.cancel()
      setPlayerTime(clampedTime)
      setActiveIndex(nextIndex)

      if (shouldResume && clampedTime < parsedScript.totalDuration) {
        const token = playbackTokenRef.current + 1
        playbackTokenRef.current = token
        setIsPlaying(true)
        window.setTimeout(() => playFromIndex(nextIndex, token), 0)
      } else {
        setIsPlaying(false)
      }
    },
    [isPlaying, parsedScript.segments, parsedScript.totalDuration, playFromIndex, setPlayerTime, stopProgress],
  )

  useEffect(() => {
    return () => {
      playbackTokenRef.current += 1
      stopProgress()
      window.speechSynthesis?.cancel()
    }
  }, [stopProgress])

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950">
      <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-slate-950">
        {activeImage ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            draggable="false"
            src={activeImage}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(15,23,42,0.94),rgba(16,185,129,0.16))]">
            <div className="px-6 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-cyan-100">
                <Volume2 aria-hidden="true" size={28} />
              </div>
              <p className="text-lg font-black text-white">{tutorial.title}</p>
            </div>
          </div>
        )}

        {activeSegment?.type === 'speech' ? (
          <div className="absolute inset-x-0 bottom-0 bg-slate-950/82 px-4 py-3 backdrop-blur">
            <p className="mx-auto max-w-3xl text-center text-sm font-semibold leading-6 text-white md:text-base">
              {activeSegment.text}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-slate-950/95 p-3">
        <div className="flex items-center gap-3">
          <button
            aria-label="Start"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onClick={() => seekTo(0)}
            title="Start"
            type="button"
          >
            <SkipBack aria-hidden="true" size={18} />
          </button>

          <button
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/50 bg-cyan-300/15 text-cyan-100 transition hover:bg-cyan-300/25 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onClick={isPlaying ? pausePlayback : play}
            title={isPlaying ? 'Pause' : 'Play'}
            type="button"
          >
            {isPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}
          </button>

          <button
            aria-label="End"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onClick={() => seekTo(parsedScript.totalDuration, false)}
            title="End"
            type="button"
          >
            <SkipForward aria-hidden="true" size={18} />
          </button>

          <label className="min-w-0 flex-1">
            <span className="sr-only">Tutorial progress</span>
            <input
              aria-label="Tutorial progress"
              className="h-2 w-full cursor-pointer accent-cyan-300"
              max={parsedScript.totalDuration}
              min={0}
              onChange={(event) => seekTo(Number(event.target.value))}
              step={0.1}
              type="range"
              value={currentTime}
            />
          </label>

          <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400">
            {formatTime(currentTime)} / {formatTime(parsedScript.totalDuration)}
          </span>
        </div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="h-full rounded-full bg-cyan-300 transition-[width]"
            style={{ width: `${clamp(progress * 100, 0, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function parseTutorialScript(script: string): ParsedTutorialScript {
  const segments: TutorialPlayerSegmentDraft[] = []
  const commandPattern = /\[(wait|img)\s*:\s*([^\]]+)\]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = commandPattern.exec(script))) {
    addSpeechSegments(script.slice(lastIndex, match.index), segments)

    if (match[1].toLowerCase() === 'wait') {
      const duration = Number.parseFloat(match[2])
      if (Number.isFinite(duration) && duration > 0) {
        segments.push({ type: 'wait', duration })
      }
    } else {
      const url = match[2].trim()
      if (url) {
        segments.push({ type: 'image', url, duration: 0 })
      }
    }

    lastIndex = commandPattern.lastIndex
  }

  addSpeechSegments(script.slice(lastIndex), segments)

  if (segments.length === 0) {
    addSpeechSegments('This tutorial script is empty.', segments)
  }

  let cursor = 0
  const timeline = segments.map((segment) => {
    const start = cursor
    const end = cursor + segment.duration
    cursor = end

    return {
      ...segment,
      start,
      end,
    } as TutorialPlayerSegment
  })

  return {
    segments: timeline,
    totalDuration: Math.max(cursor, 0.1),
  }
}

function addSpeechSegments(
  rawText: string,
  segments: TutorialPlayerSegmentDraft[],
) {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return

  const sentences = normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalizedText]

  sentences.forEach((sentence) => {
    const text = sentence.trim()
    if (!text) return

    segments.push({
      type: 'speech',
      text,
      duration: estimateSpeechDuration(text),
    })
  })
}

function estimateSpeechDuration(text: string) {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return Math.max(1.8, (wordCount / wordsPerMinute) * 60 + 0.55)
}

function getPlayableSegmentIndex(segments: TutorialPlayerSegment[], time: number) {
  const index = segments.findIndex((segment) => segment.end > time && segment.type !== 'image')

  if (index >= 0) {
    return index
  }

  return Math.max(segments.length - 1, 0)
}

function getImageForTime(segments: TutorialPlayerSegment[], time: number, activeIndex: number) {
  const indexLimit = Math.max(
    activeIndex,
    segments.findLastIndex((segment) => segment.start <= time),
  )

  for (let index = indexLimit; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment?.type === 'image') {
      return segment.url
    }
  }

  return ''
}

function formatTime(value: number) {
  const totalSeconds = Math.max(Math.floor(value), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
