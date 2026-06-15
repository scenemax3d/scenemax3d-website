import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Pencil, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import type { Tutorial } from '../types/content'

type TutorialPlayerSegment =
  | {
      type: 'speech'
      boldRanges: TextRange[]
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
      pane: ImagePane
      url: string
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'video'
      url: string
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'code'
      appendToPrevious: boolean
      code: string
      duration: 0
      start: number
      end: number
    }

type TutorialPlayerSegmentDraft =
  | {
      type: 'speech'
      boldRanges: TextRange[]
      text: string
      duration: number
    }
  | {
      type: 'wait'
      duration: number
    }
  | {
      type: 'image'
      pane: ImagePane
      url: string
      duration: 0
    }
  | {
      type: 'video'
      url: string
      duration: 0
    }
  | {
      type: 'code'
      appendToPrevious: boolean
      code: string
      duration: 0
    }

interface ParsedTutorialScript {
  segments: TutorialPlayerSegment[]
  totalDuration: number
}

interface TextRange {
  start: number
  end: number
}

type ImagePane = 'full' | 'left' | 'right'

interface CodeTextRun {
  color?: string
  href?: string
  isBold: boolean
  text: string
}

interface ImageVisual {
  type: 'image'
  layout: 'full' | 'split'
  panes: {
    full?: PaneVisual
    left?: PaneVisual
    right?: PaneVisual
  }
  signature: string
  start: number
}

type PaneVisual =
  | {
      type: 'image'
      url: string
    }
  | {
      type: 'video'
      url: string
    }
  | {
      type: 'code'
      code: string
      codeRuns: CodeTextRun[]
    }

interface ImageLayer {
  id: number
  phase: 'enter' | 'exit'
  visual: ImageVisual
}

interface TutorialScriptPlayerProps {
  autoPlay?: boolean
  editUrl?: string
  scriptText?: string
  tutorial: Tutorial
}

const defaultImage = '/assets/warrior1.png'
const wordsPerMinute = 155
const codeCharactersPerSecond = 12
const imageFadeDurationMs = 420

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

export function TutorialScriptPlayer({
  autoPlay = false,
  editUrl,
  scriptText,
  tutorial,
}: TutorialScriptPlayerProps) {
  const script = scriptText?.trim() || tutorial.tutorialScript?.trim() || buildDefaultTutorialScript(tutorial)
  const parsedScript = useMemo(() => parseTutorialScript(script), [script])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1)
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([])

  const currentTimeRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)
  const animationRef = useRef<number | undefined>(undefined)
  const playbackTokenRef = useRef(0)
  const didAutoPlayRef = useRef(false)
  const speechBoundaryAtRef = useRef(0)
  const imageLayerIdRef = useRef(0)

  const activeSegment = parsedScript.segments[activeIndex]
  const activeSpeechTokens = useMemo(
    () =>
      activeSegment?.type === 'speech'
        ? getSpeechWordTokens(activeSegment.text, activeSegment.boldRanges)
        : [],
    [activeSegment],
  )
  const activeWordCount = useMemo(
    () => activeSpeechTokens.filter((token) => token.wordIndex !== undefined).length,
    [activeSpeechTokens],
  )
  const activeVisual = useMemo(
    () => getVisualForTime(parsedScript.segments, currentTime, activeIndex),
    [activeIndex, currentTime, parsedScript.segments],
  )
  const visibleCodeLength = useMemo(
    () =>
      activeVisual?.type === 'code'
        ? activeVisual.revealImmediately
          ? activeVisual.code.length
          : getTypewriterCodeLength(
              activeVisual.code.length,
              currentTime - activeVisual.start,
              activeVisual.revealedPrefixLength,
            )
        : 0,
    [activeVisual, currentTime],
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
      setHighlightedWordIndex(segment.type === 'speech' ? 0 : -1)
      speechBoundaryAtRef.current = 0

      if (segment.type === 'image' || segment.type === 'video' || segment.type === 'code') {
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
      utterance.onboundary = (event) => {
        if (token !== playbackTokenRef.current || segment.type !== 'speech') return
        if (event.name && event.name !== 'word') return

        speechBoundaryAtRef.current = performance.now()
        setHighlightedWordIndex(getWordIndexAtChar(segment.text, event.charIndex))
      }
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

  useEffect(() => {
    if (!autoPlay || didAutoPlayRef.current || parsedScript.segments.length === 0) return

    const frame = window.requestAnimationFrame(() => {
      didAutoPlayRef.current = true
      play()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      didAutoPlayRef.current = false
    }
  }, [autoPlay, parsedScript.segments.length, play])

  const seekTo = useCallback(
    (nextTime: number, shouldResume = isPlaying) => {
      const clampedTime = clamp(nextTime, 0, parsedScript.totalDuration)
      const nextIndex = getPlayableSegmentIndex(parsedScript.segments, clampedTime)

      playbackTokenRef.current += 1
      stopProgress()
      window.speechSynthesis?.cancel()
      setPlayerTime(clampedTime)
      setActiveIndex(nextIndex)
      speechBoundaryAtRef.current = 0
      setHighlightedWordIndex(getEstimatedWordIndex(parsedScript.segments[nextIndex], clampedTime))

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
    if (activeSegment?.type !== 'speech') {
      setHighlightedWordIndex(-1)
      return
    }

    if (activeWordCount === 0) {
      setHighlightedWordIndex(-1)
      return
    }

    const hasFreshSpeechBoundary = performance.now() - speechBoundaryAtRef.current < 650
    if (hasFreshSpeechBoundary) return

    setHighlightedWordIndex(getEstimatedWordIndex(activeSegment, currentTime))
  }, [activeSegment, activeWordCount, currentTime])

  useEffect(() => {
    const activeImageVisual = activeVisual?.type === 'image' ? activeVisual : undefined

    setImageLayers((currentLayers) => {
      const currentImageLayer = currentLayers.find((layer) => layer.phase === 'enter')

      if (currentImageLayer?.visual.signature === activeImageVisual?.signature) {
        return currentLayers
      }

      const exitingLayers = currentLayers.map((layer) => ({ ...layer, phase: 'exit' as const }))

      if (!activeImageVisual) {
        return exitingLayers
      }

      imageLayerIdRef.current += 1

      return [
        ...exitingLayers,
        {
          id: imageLayerIdRef.current,
          phase: 'enter',
          visual: activeImageVisual,
        },
      ]
    })

    const cleanupTimer = window.setTimeout(() => {
      setImageLayers((currentLayers) => currentLayers.filter((layer) => layer.phase !== 'exit'))
    }, imageFadeDurationMs)

    return () => window.clearTimeout(cleanupTimer)
  }, [activeVisual])

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
        {activeVisual?.type === 'video' ? (
          <video
            autoPlay
            className="h-full w-full object-cover"
            key={activeVisual.url}
            loop
            muted
            playsInline
            src={activeVisual.url}
          />
        ) : activeVisual?.type === 'code' ? (
          <div className="grid h-full w-full place-items-center bg-slate-950 px-4 py-5 sm:px-6">
            <pre className="max-h-full w-full max-w-3xl overflow-auto rounded-md border border-cyan-300/25 bg-slate-900/95 p-4 text-left text-sm leading-6 text-cyan-50 shadow-[0_18px_70px_rgba(8,47,73,0.42)] sm:text-base">
              <code>
                {activeVisual.revealedPrefixLength > 0 ? (
                  <>
                    {renderCodeRuns(
                      activeVisual.codeRuns,
                      0,
                      Math.min(visibleCodeLength, activeVisual.revealedPrefixLength),
                    )}
                    <span className="mt-2 block whitespace-pre-wrap rounded-md border border-cyan-300/55 bg-cyan-300/5 p-2 shadow-[0_0_24px_rgba(34,211,238,0.22)]">
                      {renderCodeRuns(
                        activeVisual.codeRuns,
                        activeVisual.revealedPrefixLength,
                        visibleCodeLength,
                      )}
                      {visibleCodeLength < activeVisual.code.length ? (
                        <span className="ml-0.5 animate-pulse text-cyan-200" aria-hidden="true">
                          |
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    {renderCodeRuns(activeVisual.codeRuns, 0, visibleCodeLength)}
                    {visibleCodeLength < activeVisual.code.length ? (
                      <span className="ml-0.5 animate-pulse text-cyan-200" aria-hidden="true">
                        |
                      </span>
                    ) : null}
                  </>
                )}
              </code>
            </pre>
          </div>
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

        {imageLayers.map((layer) => (
          <div
            className={`absolute inset-0 z-10 grid place-items-center bg-slate-950 transition-opacity duration-700 ease-out ${
              layer.phase === 'enter'
                ? 'tutorial-visual-layer-enter opacity-100'
                : 'opacity-0'
            }`}
            key={layer.id}
          >
            <ImageVisualFrame visual={layer.visual} />
          </div>
        ))}

        {activeSegment?.type === 'speech' ? (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-slate-950/82 px-4 py-3 backdrop-blur">
            <p className="mx-auto max-w-3xl text-center text-sm font-semibold leading-6 text-white md:text-base">
              {activeSpeechTokens.map((token, index) => (
                <span
                  className={
                    token.wordIndex === highlightedWordIndex
                      ? `${token.isBold ? 'font-black' : ''} rounded bg-cyan-200 px-0.5 text-slate-950 shadow-[0_0_14px_rgba(103,232,249,0.38)] transition-colors`
                      : token.isBold
                        ? 'font-black'
                        : undefined
                  }
                  key={`${index}-${token.text}`}
                >
                  {token.text}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-slate-950/95 p-3">
        <div className="flex flex-wrap items-center gap-3">
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

          {editUrl ? (
            <a
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              href={editUrl}
              title="Edit tutorial"
            >
              <Pencil aria-hidden="true" size={16} />
              Edit
            </a>
          ) : null}

          <label className="min-w-36 flex-1">
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
  const commandPattern = /```(\+?)([\s\S]*?)```|\[code\s*:\s*([\s\S]*?)(?:\\\]|\/\]|\])|\[(wait|img[12]?|video)\s*:\s*([^\]]+)\]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = commandPattern.exec(script))) {
    addSpeechSegments(script.slice(lastIndex, match.index), segments)

    const fencedAppendMarker = match[1]
    const fencedCode = match[2]
    const legacyCode = match[3]
    const command = match[4]?.toLowerCase()
    const value = match[5]

    if (fencedCode !== undefined || legacyCode !== undefined) {
      const trimmedCode = normalizeCodeContent(fencedCode ?? legacyCode)
      if (trimmedCode) {
        segments.push({
          type: 'code',
          appendToPrevious: fencedAppendMarker === '+',
          code: trimmedCode,
          duration: 0,
        })
      }
    } else if (command === 'wait') {
      const duration = Number.parseFloat(value)
      if (Number.isFinite(duration) && duration > 0) {
        segments.push({ type: 'wait', duration })
      }
    } else {
      const url = value.trim()
      if (url) {
        if (command === 'video') {
          segments.push({
            type: 'video',
            url,
            duration: 0,
          })
        } else {
          segments.push({
            type: 'image',
            pane: getImagePaneForCommand(command ?? 'img'),
            url,
            duration: 0,
          })
        }
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

function ImageVisualFrame({ visual }: { visual: ImageVisual }) {
  if (visual.layout === 'full') {
    return <PaneVisualFrame visual={visual.panes.full} />
  }

  return (
    <div className="grid h-full w-full grid-cols-2 bg-slate-950">
      <PaneVisualFrame className="border-r border-white/10" visual={visual.panes.left} />
      <PaneVisualFrame visual={visual.panes.right} />
    </div>
  )
}

function PaneVisualFrame({ className = '', visual }: { className?: string; visual?: PaneVisual }) {
  return (
    <div className={`grid min-w-0 place-items-center overflow-hidden bg-slate-950 ${className}`}>
      {visual?.type === 'image' ? (
        <img
          alt=""
          className="tutorial-pane-visual max-h-full max-w-full object-contain"
          draggable="false"
          src={visual.url}
        />
      ) : visual?.type === 'video' ? (
        <video
          autoPlay
          className="tutorial-pane-visual h-full w-full object-cover"
          loop
          muted
          playsInline
          src={visual.url}
        />
      ) : visual?.type === 'code' ? (
        <div className="tutorial-pane-visual grid h-full w-full place-items-center px-3 py-4">
          <pre className="max-h-full w-full overflow-auto rounded-md border border-cyan-300/25 bg-slate-900/95 p-3 text-left text-xs leading-5 text-cyan-50 shadow-[0_18px_70px_rgba(8,47,73,0.32)] sm:text-sm">
            <code>{renderCodeRuns(visual.codeRuns, 0, visual.code.length)}</code>
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function normalizeCodeContent(code: string) {
  return code
    .replace(/^\s*\r?\n/, '')
    .replace(/\r?\n\s*$/, '')
    .trim()
}

function addSpeechSegments(
  rawText: string,
  segments: TutorialPlayerSegmentDraft[],
) {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return

  const formattedText = parseBoldMarkup(normalizedText)
  const sentenceMatches = [...formattedText.text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)]
  const sentences =
    sentenceMatches.length > 0
      ? sentenceMatches.map((match) => getFormattedSentence(match, formattedText.boldRanges))
      : [{ boldRanges: formattedText.boldRanges, text: formattedText.text }]

  sentences.forEach((sentence) => {
    const text = sentence.text
    if (!text) return

    segments.push({
      type: 'speech',
      boldRanges: sentence.boldRanges,
      text,
      duration: estimateSpeechDuration(text),
    })
  })
}

function getFormattedSentence(match: RegExpMatchArray, boldRanges: TextRange[]) {
  const rawText = match[0]
  const rawStart = match.index ?? 0
  const leadingWhitespaceLength = rawText.match(/^\s*/)?.[0].length ?? 0
  const trailingWhitespaceLength = rawText.match(/\s*$/)?.[0].length ?? 0
  const start = rawStart + leadingWhitespaceLength
  const end = rawStart + rawText.length - trailingWhitespaceLength

  return {
    boldRanges: boldRanges
      .filter((range) => rangesOverlap(start, end, range.start, range.end))
      .map((range) => ({
        start: clamp(range.start, start, end) - start,
        end: clamp(range.end, start, end) - start,
      })),
    text: rawText.trim(),
  }
}

function estimateSpeechDuration(text: string) {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return Math.max(1.8, (wordCount / wordsPerMinute) * 60 + 0.55)
}

function getSpeechWordTokens(text: string, boldRanges: TextRange[]) {
  let wordIndex = 0

  return [...text.matchAll(/\s+|\S+/g)].map((match) => {
    const token = match[0]
    const start = match.index
    const end = start + token.length

    if (/^\s+$/.test(token)) {
      return { text: token }
    }

    const currentWordIndex = wordIndex
    wordIndex += 1

    return {
      text: token,
      isBold: boldRanges.some((range) => rangesOverlap(start, end, range.start, range.end)),
      wordIndex: currentWordIndex,
    }
  })
}

function parseBoldMarkup(text: string) {
  let output = ''
  let cursor = 0
  const boldRanges: TextRange[] = []
  const boldPattern = /\*\*([\s\S]+?)\*\*/g
  let match: RegExpExecArray | null

  while ((match = boldPattern.exec(text))) {
    output += text.slice(cursor, match.index)

    const boldText = match[1]
    const start = output.length
    output += boldText
    boldRanges.push({ start, end: output.length })
    cursor = boldPattern.lastIndex
  }

  output += text.slice(cursor)

  return {
    boldRanges,
    text: output,
  }
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

function getWordIndexAtChar(text: string, charIndex: number) {
  const clampedCharIndex = clamp(charIndex, 0, text.length)
  const textBeforeBoundary = text.slice(0, clampedCharIndex)
  const precedingWords = textBeforeBoundary.match(/\S+/g)?.length ?? 0
  const isInsideWord = /\S$/.test(textBeforeBoundary) && /\S/.test(text.charAt(clampedCharIndex))

  return Math.max(precedingWords - (isInsideWord ? 1 : 0), 0)
}

function getEstimatedWordIndex(segment: TutorialPlayerSegment | undefined, time: number) {
  if (segment?.type !== 'speech') {
    return -1
  }

  const wordCount = segment.text.split(/\s+/).filter(Boolean).length
  if (wordCount === 0) {
    return -1
  }

  const progressWithinSegment = clamp(
    (time - segment.start) / Math.max(segment.duration, 0.1),
    0,
    0.999,
  )

  return clamp(Math.floor(progressWithinSegment * wordCount), 0, wordCount - 1)
}

function getPlayableSegmentIndex(segments: TutorialPlayerSegment[], time: number) {
  const index = segments.findIndex(
    (segment) =>
      segment.end > time &&
      segment.type !== 'image' &&
      segment.type !== 'video' &&
      segment.type !== 'code',
  )

  if (index >= 0) {
    return index
  }

  return Math.max(segments.length - 1, 0)
}

function getVisualForTime(segments: TutorialPlayerSegment[], time: number, activeIndex: number) {
  const indexLimit = Math.max(
    activeIndex,
    segments.findLastIndex((segment) => segment.start <= time),
  )

  for (let index = indexLimit; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment?.type === 'image') {
      return getImageVisualForSegment(segments, index)
    }
    if (segment?.type === 'video') {
      return {
        type: segment.type,
        start: segment.start,
        url: segment.url,
      }
    }
    if (segment?.type === 'code') {
      return getCodeVisualForSegment(segments, index)
    }
  }

  return undefined
}

function getImagePaneForCommand(command: string): ImagePane {
  if (command === 'img1') return 'left'
  if (command === 'img2') return 'right'
  return 'full'
}

function getImageVisualForSegment(segments: TutorialPlayerSegment[], imageSegmentIndex: number): ImageVisual {
  let leftVisual: PaneVisual | undefined
  let rightVisual: PaneVisual | undefined
  let lastFullVisual: PaneVisual | undefined

  for (let index = 0; index <= imageSegmentIndex; index += 1) {
    const segment = segments[index]
    if (!segment) continue

    if (segment.type === 'image') {
      if (segment.pane === 'full') {
        lastFullVisual = { type: 'image', url: segment.url }
        leftVisual = undefined
        rightVisual = undefined
      } else if (segment.pane === 'left') {
        leftVisual = { type: 'image', url: segment.url }
      } else {
        leftVisual ??= lastFullVisual
        rightVisual = { type: 'image', url: segment.url }
      }
    }

    if (segment.type === 'video') {
      lastFullVisual = { type: 'video', url: segment.url }
      leftVisual = undefined
      rightVisual = undefined
    }

    if (segment.type === 'code') {
      const codeVisual = getCodeVisualForSegment(segments, index)
      lastFullVisual = { type: 'code', code: codeVisual.code, codeRuns: codeVisual.codeRuns }
      leftVisual = undefined
      rightVisual = undefined
    }
  }

  const segment = segments[imageSegmentIndex]

  if (segment?.type === 'image' && segment.pane === 'full') {
    return {
      type: 'image',
      layout: 'full',
      panes: { full: { type: 'image', url: segment.url } },
      signature: `full:${segment.url}`,
      start: segment.start,
    }
  }

  return {
    type: 'image',
    layout: 'split',
    panes: {
      left: leftVisual,
      right: rightVisual,
    },
    signature: `split:${getPaneVisualSignature(leftVisual)}:${getPaneVisualSignature(rightVisual)}`,
    start: segment?.start ?? 0,
  }
}

function getPaneVisualSignature(visual: PaneVisual | undefined) {
  if (!visual) return ''
  if (visual.type === 'code') return `code:${visual.code}`
  return `${visual.type}:${visual.url}`
}

function getCodeVisualForSegment(segments: TutorialPlayerSegment[], codeSegmentIndex: number) {
  const blocks = []
  let index = codeSegmentIndex

  while (index >= 0) {
    const segment = segments[index]
    if (segment?.type !== 'code') {
      index -= 1
      continue
    }

    blocks.unshift(segment.code)

    if (!segment.appendToPrevious) {
      break
    }

    index -= 1
  }

  const segment = segments[codeSegmentIndex]
  const previousCode = formatCodeBlocks(blocks.slice(0, -1)).text
  const formattedCode = formatCodeBlocks(blocks)

  return {
    type: 'code' as const,
    start: segment.start,
    code: formattedCode.text,
    codeRuns: formattedCode.runs,
    revealImmediately: !hasLaterPlayableSegment(segments, codeSegmentIndex),
    revealedPrefixLength: previousCode ? previousCode.length + 1 : 0,
  }
}

function hasLaterPlayableSegment(segments: TutorialPlayerSegment[], fromIndex: number) {
  return segments
    .slice(fromIndex + 1)
    .some((segment) => segment.type !== 'image' && segment.type !== 'video' && segment.type !== 'code')
}

function formatCodeBlocks(blocks: string[]) {
  const runs: CodeTextRun[] = []

  blocks.filter(Boolean).forEach((block, index, filteredBlocks) => {
    parseCodeMarkup(block).forEach((run) => addCodeRun(runs, run.text, run.isBold, run.color, run.href))

    if (index < filteredBlocks.length - 1) {
      addCodeRun(runs, '\n', false)
    }
  })

  return {
    runs,
    text: runs.map((run) => run.text).join(''),
  }
}

function parseCodeMarkup(code: string) {
  const runs: CodeTextRun[] = []
  let buffer = ''
  let index = 0
  let isBold = false
  let color: string | undefined

  while (index < code.length) {
    if (code.startsWith('**', index) && (isBold || code.indexOf('**', index + 2) >= 0)) {
      addCodeRun(runs, buffer, isBold, color)
      buffer = ''
      isBold = !isBold
      index += 2
      continue
    }

    const colorTagMatch = code.slice(index).match(/^\[color\s*:\s*(default|#?[0-9a-f]{6})\]/i)
    if (colorTagMatch) {
      addCodeRun(runs, buffer, isBold, color)
      buffer = ''
      color = normalizeCodeColor(colorTagMatch[1])
      index += colorTagMatch[0].length
      continue
    }

    const refTagMatch = code.slice(index).match(/^\[ref\s*:\s*([^\]]*?)\s*\((https?:\/\/[^)\s]+)\)\]/i)
    if (refTagMatch) {
      addCodeRun(runs, buffer, isBold, color)
      buffer = ''
      addCodeRun(runs, refTagMatch[1].trim(), isBold, color, refTagMatch[2])
      index += refTagMatch[0].length
      continue
    }

    buffer += code[index]
    index += 1
  }

  addCodeRun(runs, buffer, isBold, color)

  return runs
}

function normalizeCodeColor(value: string) {
  if (value.toLowerCase() === 'default') return undefined

  const hex = value.replace(/^#/, '')
  return `#${hex.toUpperCase()}`
}

function addCodeRun(
  runs: CodeTextRun[],
  text: string,
  isBold: boolean,
  color?: string,
  href?: string,
) {
  if (!text) return

  const lastRun = runs.at(-1)
  if (lastRun?.isBold === isBold && lastRun.color === color && lastRun.href === href) {
    lastRun.text += text
    return
  }

  runs.push({ color, href, isBold, text })
}

function renderCodeRuns(runs: CodeTextRun[], start = 0, end = Number.POSITIVE_INFINITY) {
  const nodes = []
  let cursor = 0

  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd

    if (!rangesOverlap(start, end, runStart, runEnd)) {
      continue
    }

    const text = run.text.slice(Math.max(start, runStart) - runStart, Math.min(end, runEnd) - runStart)

    if (run.href) {
      nodes.push(
        <a
          className={`${run.isBold ? 'font-black ' : ''}underline decoration-cyan-300/70 underline-offset-4 transition hover:text-cyan-200`}
          href={run.href}
          key={`${runStart}-${runEnd}-${run.color ?? 'default'}-${run.href}-${run.isBold}`}
          rel="noreferrer"
          style={run.color ? { color: run.color } : undefined}
          target="_blank"
        >
          {text}
        </a>,
      )
      continue
    }

    nodes.push(
      <span
        className={run.isBold ? 'font-black' : undefined}
        key={`${runStart}-${runEnd}-${run.color ?? 'default'}-${run.isBold}`}
        style={run.color ? { color: run.color } : undefined}
      >
        {text}
      </span>,
    )
  }

  return nodes
}

function getTypewriterCodeLength(codeLength: number, elapsedSeconds: number, revealedPrefixLength = 0) {
  return clamp(
    revealedPrefixLength + Math.floor(Math.max(elapsedSeconds, 0) * codeCharactersPerSecond),
    0,
    codeLength,
  )
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
