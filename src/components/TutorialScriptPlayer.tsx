import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
      frame?: RenderFrame
      pane: ImagePane
      url: string
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'video'
      frame?: RenderFrame
      url: string
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'code'
      appendToPrevious: boolean
      code: string
      frame?: RenderFrame
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'codeLayer'
      commands: string
      frame?: RenderFrame
      duration: 0
      start: number
      end: number
    }
  | {
      type: 'layout'
      layout: TutorialPanelLayout
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
      frame?: RenderFrame
      pane: ImagePane
      url: string
      duration: 0
    }
  | {
      type: 'video'
      frame?: RenderFrame
      url: string
      duration: 0
    }
  | {
      type: 'code'
      appendToPrevious: boolean
      code: string
      frame?: RenderFrame
      duration: 0
    }
  | {
      type: 'codeLayer'
      commands: string
      frame?: RenderFrame
      duration: 0
    }
  | {
      type: 'layout'
      layout: TutorialPanelLayout
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

interface RenderFrame {
  column: number
  row: number
}

interface TutorialPanelLayout {
  columns: number
  rows: number
}

interface CodeTextRun {
  circle?: CodeCircle
  color?: string
  href?: string
  isBold: boolean
  text: string
}

interface CodeCircle {
  color: string
  end: number
  id: number
  start: number
}

interface CodeLayerModifier {
  color?: string
  isBold?: boolean
  text: string
}

interface CodeCircleAnnotation {
  color?: string
  text: string
}

interface CodeRunRenderPiece {
  circle?: CodeCircle
  key: string
  node: ReactNode
}

interface ImageVisual {
  type: 'image'
  layout: 'full' | 'grid' | 'split'
  grid?: {
    cells: Array<PaneVisual | undefined>
    columns: number
    rows: number
  }
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
const shortcutCodeColors = {
  b: 'blue',
  g: '#00FF00',
  m: 'magenta',
  o: 'orange',
  r: 'red',
  y: 'yellow',
} as const
const defaultCodeCircleColor = shortcutCodeColors.r

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

      if (
        segment.type === 'image' ||
        segment.type === 'video' ||
        segment.type === 'code' ||
        segment.type === 'codeLayer' ||
        segment.type === 'layout'
      ) {
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
          <VideoVisualFrame
            className="h-full w-full object-cover"
            key={activeVisual.url}
            title={tutorial.title}
            url={activeVisual.url}
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
  const commandPattern = /```([^\r\n`]*)\r?\n([\s\S]*?)```|```([+#]?)([\s\S]*?)```|\[code\s*:\s*([\s\S]*?)(?:\\\]|\/\]|\])|\[(wait|layout|img[12]?|video)(?:\s+(r\d+c\d+))?\s*:\s*([^\]]+)\]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = commandPattern.exec(script))) {
    addSpeechSegments(script.slice(lastIndex, match.index), segments)

    const fencedInfo = match[1]
    const fencedBlockCode = match[2]
    const inlineFencedMarker = match[3]
    const inlineFencedCode = match[4]
    const legacyCode = match[5]
    const command = match[6]?.toLowerCase()
    const commandFrame = parseRenderFrame(match[7])
    const value = match[8]

    if (fencedBlockCode !== undefined || inlineFencedCode !== undefined || legacyCode !== undefined) {
      const fenceOptions =
        fencedBlockCode !== undefined
          ? parseCodeFenceInfo(fencedInfo ?? '')
          : { appendToPrevious: inlineFencedMarker === '+', frame: undefined, isLayer: inlineFencedMarker === '#' }
      const trimmedCode = normalizeCodeContent(fencedBlockCode ?? inlineFencedCode ?? legacyCode)
      if (trimmedCode) {
        if (fenceOptions.isLayer) {
          segments.push({
            type: 'codeLayer',
            commands: trimmedCode,
            frame: fenceOptions.frame,
            duration: 0,
          })
        } else {
          segments.push({
            type: 'code',
            appendToPrevious: fenceOptions.appendToPrevious,
            code: trimmedCode,
            frame: fenceOptions.frame,
            duration: 0,
          })
        }
      }
    } else if (command === 'wait') {
      const duration = Number.parseFloat(value)
      if (Number.isFinite(duration) && duration > 0) {
        segments.push({ type: 'wait', duration })
      }
    } else if (command === 'layout') {
      const layout = parsePanelLayout(value)
      if (layout) {
        segments.push({ type: 'layout', layout, duration: 0 })
      }
    } else {
      const url = value.trim()
      if (url) {
        if (command === 'video') {
          segments.push({
            type: 'video',
            frame: commandFrame,
            url,
            duration: 0,
          })
        } else {
          segments.push({
            type: 'image',
            frame: commandFrame,
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

function parseCodeFenceInfo(info: string) {
  const options: {
    appendToPrevious: boolean
    frame?: RenderFrame
    isLayer: boolean
  } = {
    appendToPrevious: false,
    isLayer: false,
  }

  info
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((rawToken) => {
      let token = rawToken

      while (token.startsWith('+') || token.startsWith('#')) {
        if (token[0] === '+') {
          options.appendToPrevious = true
        } else {
          options.isLayer = true
        }

        token = token.slice(1)
      }

      const frame = parseRenderFrame(token)
      if (frame) {
        options.frame = frame
      }
    })

  return options
}

function parsePanelLayout(value: string | undefined): TutorialPanelLayout | undefined {
  const frame = parseRenderFrame(value)
  if (!frame) return undefined

  return {
    columns: frame.column,
    rows: frame.row,
  }
}

function parseRenderFrame(value: string | undefined): RenderFrame | undefined {
  const match = value?.trim().match(/^r([1-9]\d*)c([1-9]\d*)$/i)
  if (!match) return undefined

  return {
    column: Number.parseInt(match[2], 10),
    row: Number.parseInt(match[1], 10),
  }
}

function ImageVisualFrame({ visual }: { visual: ImageVisual }) {
  if (visual.layout === 'full') {
    return <PaneVisualFrame visual={visual.panes.full} />
  }

  if (visual.layout === 'grid' && visual.grid) {
    const grid = visual.grid

    return (
      <div
        className="grid h-full w-full bg-slate-950"
        style={{
          gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {grid.cells.map((cell, index) => {
          const column = (index % grid.columns) + 1
          const row = Math.floor(index / grid.columns) + 1

          return (
            <PaneVisualFrame
              className={getGridCellClassName(row, column, grid)}
              key={`${row}-${column}`}
              visual={cell}
            />
          )
        })}
      </div>
    )
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
        <VideoVisualFrame
          className="tutorial-pane-visual h-full w-full object-cover"
          title="Tutorial video"
          url={visual.url}
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

function getGridCellClassName(row: number, column: number, layout: TutorialPanelLayout) {
  const classes = []

  if (column < layout.columns) {
    classes.push('border-r border-white/10')
  }

  if (row < layout.rows) {
    classes.push('border-b border-white/10')
  }

  return classes.join(' ')
}

function VideoVisualFrame({
  className = '',
  title,
  url,
}: {
  className?: string
  title: string
  url: string
}) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(url)

  if (youtubeEmbedUrl) {
    return (
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className={`${className} border-0`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={youtubeEmbedUrl}
        title={title}
      />
    )
  }

  return (
    <video
      autoPlay
      className={className}
      loop
      muted
      playsInline
      src={url}
    />
  )
}

function getYouTubeEmbedUrl(url: string) {
  const videoId = getYouTubeVideoId(url)
  if (!videoId) return undefined

  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    loop: '1',
    mute: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
  })

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

function getYouTubeVideoId(rawUrl: string) {
  const trimmedUrl = rawUrl.trim()

  if (/^[\w-]{11}$/.test(trimmedUrl)) {
    return trimmedUrl
  }

  try {
    const parsedUrl = new URL(trimmedUrl)
    const hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase()

    if (
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'youtube-nocookie.com'
    ) {
      if (parsedUrl.pathname === '/watch') {
        return normalizeYouTubeVideoId(parsedUrl.searchParams.get('v'))
      }

      const [, pathType, pathId] = parsedUrl.pathname.split('/')
      if (pathType === 'embed' || pathType === 'shorts' || pathType === 'live') {
        return normalizeYouTubeVideoId(pathId)
      }
    }

    if (hostname === 'youtu.be') {
      return normalizeYouTubeVideoId(parsedUrl.pathname.split('/').filter(Boolean)[0])
    }
  } catch {
    return undefined
  }

  return undefined
}

function normalizeYouTubeVideoId(videoId: string | null | undefined) {
  if (!videoId) return undefined
  const cleanVideoId = videoId.trim()
  return /^[\w-]{11}$/.test(cleanVideoId) ? cleanVideoId : undefined
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
      segment.type !== 'code' &&
      segment.type !== 'codeLayer' &&
      segment.type !== 'layout',
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
    if (segment?.type === 'layout' || hasRenderFrame(segment)) {
      const gridVisual = getGridVisualForSegment(segments, index)
      if (gridVisual) return gridVisual
      continue
    }
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
      return getSplitVisualForCodeSegment(segments, index) ?? getCodeVisualForSegment(segments, index)
    }
    if (segment?.type === 'codeLayer') {
      return getSplitVisualForCodeSegment(segments, index) ?? getCodeVisualForSegment(segments, index)
    }
  }

  return undefined
}

function getImagePaneForCommand(command: string): ImagePane {
  if (command === 'img1') return 'left'
  if (command === 'img2') return 'right'
  return 'full'
}

function getGridVisualForSegment(segments: TutorialPlayerSegment[], visualSegmentIndex: number): ImageVisual | undefined {
  const layoutSegmentIndex = getActiveLayoutSegmentIndex(segments, visualSegmentIndex)
  const layoutSegment = segments[layoutSegmentIndex]
  if (layoutSegment?.type !== 'layout') return undefined

  const layout = layoutSegment.layout
  const cells: Array<PaneVisual | undefined> = Array.from({ length: layout.rows * layout.columns })

  for (let index = layoutSegmentIndex + 1; index <= visualSegmentIndex; index += 1) {
    const segment = segments[index]
    const frame = getRenderFrame(segment)

    if (!segment || !frame || !isFrameInsideLayout(frame, layout)) {
      continue
    }

    const cellIndex = getGridCellIndex(frame, layout)

    if (segment.type === 'image') {
      cells[cellIndex] = { type: 'image', url: segment.url }
    } else if (segment.type === 'video') {
      cells[cellIndex] = { type: 'video', url: segment.url }
    } else if (segment.type === 'code' || segment.type === 'codeLayer') {
      const codeVisual = getCodeVisualForSegment(segments, index)
      cells[cellIndex] = { type: 'code', code: codeVisual.code, codeRuns: codeVisual.codeRuns }
    }
  }

  return {
    type: 'image',
    layout: 'grid',
    grid: {
      cells,
      columns: layout.columns,
      rows: layout.rows,
    },
    panes: {},
    signature: `grid:${layout.rows}x${layout.columns}:${cells.map(getPaneVisualSignature).join(':')}`,
    start: segments[visualSegmentIndex]?.start ?? layoutSegment.start,
  }
}

function getActiveLayoutSegmentIndex(segments: TutorialPlayerSegment[], beforeIndex: number) {
  for (let index = beforeIndex; index >= 0; index -= 1) {
    const segment = segments[index]

    if (segment?.type === 'layout') {
      return index
    }

    if (
      segment &&
      (segment.type === 'image' || segment.type === 'video' || segment.type === 'code' || segment.type === 'codeLayer') &&
      !hasRenderFrame(segment)
    ) {
      return -1
    }
  }

  return -1
}

function hasRenderFrame(segment: TutorialPlayerSegment | undefined) {
  return getRenderFrame(segment) !== undefined
}

function getRenderFrame(segment: TutorialPlayerSegment | undefined) {
  if (
    segment?.type === 'image' ||
    segment?.type === 'video' ||
    segment?.type === 'code' ||
    segment?.type === 'codeLayer'
  ) {
    return segment.frame
  }

  return undefined
}

function renderFramesMatch(left: RenderFrame | undefined, right: RenderFrame | undefined) {
  if (!left || !right) return left === right

  return left.row === right.row && left.column === right.column
}

function isFrameInsideLayout(frame: RenderFrame, layout: TutorialPanelLayout) {
  return frame.row >= 1 && frame.row <= layout.rows && frame.column >= 1 && frame.column <= layout.columns
}

function getGridCellIndex(frame: RenderFrame, layout: TutorialPanelLayout) {
  return (frame.row - 1) * layout.columns + (frame.column - 1)
}

function getImageVisualForSegment(segments: TutorialPlayerSegment[], imageSegmentIndex: number): ImageVisual {
  let leftVisual: PaneVisual | undefined
  let rightVisual: PaneVisual | undefined
  let lastFullVisual: PaneVisual | undefined

  for (let index = 0; index <= imageSegmentIndex; index += 1) {
    const segment = segments[index]
    if (!segment) continue

    if (segment.type === 'layout' || hasRenderFrame(segment)) continue

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

    if (segment.type === 'code' || segment.type === 'codeLayer') {
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

function getSplitVisualForCodeSegment(segments: TutorialPlayerSegment[], codeSegmentIndex: number): ImageVisual | undefined {
  const imageSegmentIndex = getActiveSplitImageSegmentIndex(segments, codeSegmentIndex)
  if (imageSegmentIndex < 0) return undefined

  const imageSegment = segments[imageSegmentIndex]
  if (imageSegment?.type !== 'image' || imageSegment.pane === 'full') return undefined

  const codeVisual = getCodeVisualForSegment(segments, codeSegmentIndex)
  const imageVisual = getImageVisualForSegment(segments, imageSegmentIndex)
  const codePane = {
    type: 'code' as const,
    code: codeVisual.code,
    codeRuns: codeVisual.codeRuns,
  }

  const panes =
    imageSegment.pane === 'right'
      ? { ...imageVisual.panes, left: codePane }
      : { ...imageVisual.panes, right: codePane }

  return {
    type: 'image',
    layout: 'split',
    panes,
    signature: `split:${getPaneVisualSignature(panes.left)}:${getPaneVisualSignature(panes.right)}`,
    start: codeVisual.start,
  }
}

function getActiveSplitImageSegmentIndex(segments: TutorialPlayerSegment[], beforeIndex: number) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const segment = segments[index]

    if (segment?.type === 'layout') {
      return -1
    }

    if (segment?.type === 'image') {
      if (hasRenderFrame(segment)) continue
      return segment.pane === 'full' ? -1 : index
    }

    if (segment?.type === 'video') {
      if (hasRenderFrame(segment)) continue
      return -1
    }
  }

  return -1
}

function getPaneVisualSignature(visual: PaneVisual | undefined) {
  if (!visual) return ''
  if (visual.type === 'code') return `code:${getCodeRunsSignature(visual.codeRuns)}`
  return `${visual.type}:${visual.url}`
}

function getCodeRunsSignature(runs: CodeTextRun[]) {
  return runs
    .map(
      (run) =>
        `${run.text}:${run.color ?? ''}:${run.href ?? ''}:${run.isBold ? '1' : '0'}:${
          run.circle ? `${run.circle.id},${run.circle.color},${run.circle.start},${run.circle.end}` : ''
        }`,
    )
    .join('|')
}

function getCodeVisualForSegment(segments: TutorialPlayerSegment[], visualSegmentIndex: number) {
  const blocks: string[] = []
  const layers: string[] = []
  const visualFrame = getRenderFrame(segments[visualSegmentIndex])
  let index = visualSegmentIndex

  while (index >= 0) {
    const segment = segments[index]

    if (segment?.type === 'codeLayer') {
      if (renderFramesMatch(segment.frame, visualFrame)) {
        layers.unshift(segment.commands)
      }

      index -= 1
      continue
    }

    if (segment?.type !== 'code' || !renderFramesMatch(segment.frame, visualFrame)) {
      index -= 1
      continue
    }

    blocks.unshift(segment.code)

    if (!segment.appendToPrevious) {
      break
    }

    index -= 1
  }

  const segment = segments[visualSegmentIndex]
  const previousCode = formatCodeBlocks(blocks.slice(0, -1)).text
  const formattedCode = applyCodeLayers(formatCodeBlocks(blocks), layers)

  return {
    type: 'code' as const,
    start: segment.start,
    code: formattedCode.text,
    codeRuns: formattedCode.runs,
    revealImmediately: segment.type === 'codeLayer' || !hasLaterPlayableSegment(segments, visualSegmentIndex),
    revealedPrefixLength: previousCode ? previousCode.length + 1 : 0,
  }
}

function hasLaterPlayableSegment(segments: TutorialPlayerSegment[], fromIndex: number) {
  return segments
    .slice(fromIndex + 1)
    .some(
      (segment) =>
        segment.type !== 'image' &&
        segment.type !== 'video' &&
        segment.type !== 'code' &&
        segment.type !== 'codeLayer' &&
        segment.type !== 'layout',
    )
}

function formatCodeBlocks(blocks: string[]) {
  const runs: CodeTextRun[] = []
  const circleAnnotations: CodeCircleAnnotation[] = []

  blocks.filter(Boolean).forEach((block, index, filteredBlocks) => {
    const extractedBlock = extractCodeCircleAnnotations(block)
    circleAnnotations.push(...extractedBlock.annotations)
    parseCodeMarkup(extractedBlock.code).forEach((run) =>
      addCodeRun(runs, run.text, run.isBold, run.color, run.href, run.circle),
    )

    if (index < filteredBlocks.length - 1) {
      addCodeRun(runs, '\n', false)
    }
  })

  circleAnnotations.forEach((annotation) => {
    applyCodeCircleAnnotation(runs, annotation)
  })

  return {
    runs,
    text: runs.map((run) => run.text).join(''),
  }
}

function applyCodeLayers(formattedCode: { runs: CodeTextRun[]; text: string }, layers: string[]) {
  let runs = formattedCode.runs

  layers.forEach((layer) => {
    parseCodeLayerCommands(layer).forEach((command) => {
      if (command.type === 'clear') {
        runs = resetCodeRunFormatting(runs)
      } else if (command.type === 'mod') {
        runs = applyCodeLayerModifier(runs, command.modifier)
      } else {
        applyCodeCircleAnnotation(runs, command.annotation)
      }
    })
  })

  return {
    runs,
    text: runs.map((run) => run.text).join(''),
  }
}

function parseCodeLayerCommands(layer: string) {
  const commands: Array<
    { type: 'clear' } | { type: 'mod'; modifier: CodeLayerModifier } | { type: 'circle'; annotation: CodeCircleAnnotation }
  > = []
  const commandPattern = /\[\s*(?:(clear)|(mod|circle)\s*:\s*"((?:\\.|[^"\\])*)"\s*(?:,\s*([^\]]+))?)\]/gi
  let match: RegExpExecArray | null

  while ((match = commandPattern.exec(layer))) {
    if (match[1]) {
      commands.push({ type: 'clear' })
      continue
    }

    const commandType = match[2]?.toLowerCase()
    const commandText = unescapeQuotedCodeText(match[3] ?? '')
    if (!commandText) continue

    if (commandType === 'circle') {
      commands.push({
        type: 'circle',
        annotation: {
          text: getRenderedCodeText(commandText),
          ...parseCodeCircleOptions(match[4] ?? ''),
        },
      })
    } else {
      commands.push({
        type: 'mod',
        modifier: {
          text: commandText,
          ...parseCodeLayerModifierOptions(match[4] ?? ''),
        },
      })
    }
  }

  return commands
}

function parseCodeLayerModifierOptions(options: string) {
  const modifier: Omit<CodeLayerModifier, 'text'> = {}
  const color = parseCodeColorOption(options)

  if (color) {
    modifier.color = color
  }

  if (/\bbold\b/i.test(options)) {
    modifier.isBold = true
  }

  return modifier
}

function parseCodeCircleOptions(options: string) {
  const annotation: Omit<CodeCircleAnnotation, 'text'> = {}
  const color = parseCodeColorOption(options)

  if (color) {
    annotation.color = color
  }

  return annotation
}

function extractCodeCircleAnnotations(code: string) {
  const annotations: CodeCircleAnnotation[] = []
  const lines = code.split(/\r?\n/)

  const visibleLines = lines
    .map((line) => {
      let hasCircleCommand = false
      const visibleLine = line.replace(getCodeCircleCommandPattern(), (_command, target: string, options = '') => {
        hasCircleCommand = true

        const text = unescapeQuotedCodeText(target)
        if (text) {
          annotations.push({
            text: getRenderedCodeText(text),
            ...parseCodeCircleOptions(options),
          })
        }

        return text
      })

      return hasCircleCommand && visibleLine.trim() === '' ? undefined : visibleLine
    })
    .filter((line): line is string => line !== undefined)

  return {
    annotations,
    code: visibleLines.join('\n'),
  }
}

function getCodeCircleCommandPattern() {
  return /\[\s*circle\s*:\s*"((?:\\.|[^"\\])*)"\s*(?:,\s*([^\]]+))?\]/gi
}

function getRenderedCodeText(code: string) {
  return parseCodeMarkup(code)
    .map((run) => run.text)
    .join('')
}

function resetCodeRunFormatting(runs: CodeTextRun[]) {
  return runs.map((run) => ({
    href: run.href,
    isBold: false,
    text: run.text,
  }))
}

function applyCodeLayerModifier(runs: CodeTextRun[], modifier: CodeLayerModifier) {
  if (!modifier.text) return runs

  const text = runs.map((run) => run.text).join('')
  const ranges: TextRange[] = []
  let matchIndex = text.indexOf(modifier.text)

  while (matchIndex >= 0) {
    ranges.push({ start: matchIndex, end: matchIndex + modifier.text.length })
    matchIndex = text.indexOf(modifier.text, matchIndex + modifier.text.length)
  }

  if (ranges.length === 0) return runs

  const nextRuns: CodeTextRun[] = []
  let cursor = 0

  runs.forEach((run) => {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd
    let runCursor = runStart

    ranges
      .filter((range) => rangesOverlap(runStart, runEnd, range.start, range.end))
      .forEach((range) => {
        const styledStart = Math.max(runStart, range.start)
        const styledEnd = Math.min(runEnd, range.end)

        addCodeRun(
          nextRuns,
          run.text.slice(runCursor - runStart, styledStart - runStart),
          run.isBold,
          run.color,
          run.href,
          run.circle,
        )
        addCodeRun(
          nextRuns,
          run.text.slice(styledStart - runStart, styledEnd - runStart),
          modifier.isBold ?? run.isBold,
          modifier.color ?? run.color,
          run.href,
          run.circle,
        )
        runCursor = styledEnd
      })

    addCodeRun(
      nextRuns,
      run.text.slice(runCursor - runStart),
      run.isBold,
      run.color,
      run.href,
      run.circle,
    )
  })

  return nextRuns
}

function applyCodeCircleAnnotation(runs: CodeTextRun[], annotation: CodeCircleAnnotation) {
  if (!annotation.text) return runs

  const text = runs.map((run) => run.text).join('')
  const ranges: TextRange[] = []
  let matchIndex = text.indexOf(annotation.text)

  while (matchIndex >= 0) {
    ranges.push({ start: matchIndex, end: matchIndex + annotation.text.length })
    matchIndex = text.indexOf(annotation.text, matchIndex + annotation.text.length)
  }

  if (ranges.length === 0) return runs

  const nextRuns: CodeTextRun[] = []
  let cursor = 0
  const nextCircleId = getNextCodeCircleId(runs)

  runs.forEach((run) => {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd
    let runCursor = runStart

    ranges
      .filter((range) => rangesOverlap(runStart, runEnd, range.start, range.end))
      .forEach((range) => {
        const styledStart = Math.max(runStart, range.start)
        const styledEnd = Math.min(runEnd, range.end)
        const circle = {
          color: annotation.color ?? defaultCodeCircleColor,
          end: range.end,
          id: nextCircleId + ranges.indexOf(range),
          start: range.start,
        }

        addCodeRun(
          nextRuns,
          run.text.slice(runCursor - runStart, styledStart - runStart),
          run.isBold,
          run.color,
          run.href,
          run.circle,
        )
        addCodeRun(
          nextRuns,
          run.text.slice(styledStart - runStart, styledEnd - runStart),
          run.isBold,
          run.color,
          run.href,
          circle,
        )
        runCursor = styledEnd
      })

    addCodeRun(
      nextRuns,
      run.text.slice(runCursor - runStart),
      run.isBold,
      run.color,
      run.href,
      run.circle,
    )
  })

  runs.splice(0, runs.length, ...nextRuns)
  return runs
}

function getNextCodeCircleId(runs: CodeTextRun[]) {
  return runs.reduce((nextId, run) => Math.max(nextId, (run.circle?.id ?? -1) + 1), 0)
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

    const colorTagMatch = code.slice(index).match(/^\[color\s*:\s*(default|#?[0-9a-f]{6}|[rgboym])\]/i)
    if (colorTagMatch) {
      addCodeRun(runs, buffer, isBold, color)
      buffer = ''
      color = normalizeCodeColor(colorTagMatch[1])
      index += colorTagMatch[0].length
      continue
    }

    const shortcutColorTagMatch = code.slice(index).match(/^\[([rgboym])\]/i)
    if (shortcutColorTagMatch) {
      addCodeRun(runs, buffer, isBold, color)
      buffer = ''

      const tagLength = shortcutColorTagMatch[0].length
      const targetMatch = code.slice(index + tagLength).match(/^(\s*)([A-Za-z0-9_]+)/)

      if (targetMatch) {
        addCodeRun(runs, targetMatch[1], isBold, color)
        addCodeRun(
          runs,
          targetMatch[2],
          isBold,
          shortcutCodeColors[
            shortcutColorTagMatch[1].toLowerCase() as keyof typeof shortcutCodeColors
          ],
        )
        index += tagLength + targetMatch[0].length
      } else {
        index += tagLength
      }

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
  const trimmedValue = value.trim()
  if (trimmedValue.toLowerCase() === 'default') return undefined

  const shortcutColor = shortcutCodeColors[trimmedValue.toLowerCase() as keyof typeof shortcutCodeColors]
  if (shortcutColor) return shortcutColor

  const hex = trimmedValue.replace(/^#/, '')
  return `#${hex.toUpperCase()}`
}

function parseCodeColorOption(options: string) {
  const colorMatch = options.match(/\bcolor\s*:\s*(default|#?[0-9a-f]{6}|[rgboym])\b/i)
  if (!colorMatch) return undefined

  return normalizeCodeColor(colorMatch[1])
}

function unescapeQuotedCodeText(text: string) {
  return text.replace(/\\(["\\])/g, '$1')
}

function addCodeRun(
  runs: CodeTextRun[],
  text: string,
  isBold: boolean,
  color?: string,
  href?: string,
  circle?: CodeCircle,
) {
  if (!text) return

  const lastRun = runs.at(-1)
  if (
    lastRun?.isBold === isBold &&
    lastRun.color === color &&
    lastRun.href === href &&
    codeCirclesMatch(lastRun.circle, circle)
  ) {
    lastRun.text += text
    return
  }

  runs.push({ circle, color, href, isBold, text })
}

function codeCirclesMatch(left: CodeCircle | undefined, right: CodeCircle | undefined) {
  if (!left || !right) return left === right

  return left.id === right.id && left.color === right.color && left.start === right.start && left.end === right.end
}

function renderCodeRuns(runs: CodeTextRun[], start = 0, end = Number.POSITIVE_INFINITY) {
  const pieces: CodeRunRenderPiece[] = []
  let cursor = 0

  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd

    if (!rangesOverlap(start, end, runStart, runEnd)) {
      continue
    }

    const text = run.text.slice(Math.max(start, runStart) - runStart, Math.min(end, runEnd) - runStart)

    pieces.push({
      circle: run.circle,
      key: `${runStart}-${runEnd}-${run.color ?? 'default'}-${run.href ?? ''}-${run.isBold}-${run.circle?.id ?? 'none'}`,
      node: renderCodeRunNode(run, text, runStart, runEnd),
    })
  }

  return groupCodeRunPieces(pieces, start, end)
}

function renderCodeRunNode(run: CodeTextRun, text: string, runStart: number, runEnd: number) {
  if (run.href) {
    return (
      <a
        className={`${run.isBold ? 'font-black ' : ''}underline decoration-cyan-300/70 underline-offset-4 transition hover:text-cyan-200`}
        href={run.href}
        key={`${runStart}-${runEnd}-${run.color ?? 'default'}-${run.href}-${run.isBold}`}
        rel="noreferrer"
        style={run.color ? { color: run.color } : undefined}
        target="_blank"
      >
        {text}
      </a>
    )
  }

  return (
    <span
      className={run.isBold ? 'font-black' : undefined}
      key={`${runStart}-${runEnd}-${run.color ?? 'default'}-${run.isBold}`}
      style={run.color ? { color: run.color } : undefined}
    >
      {text}
    </span>
  )
}

function groupCodeRunPieces(pieces: CodeRunRenderPiece[], start: number, end: number) {
  const nodes: ReactNode[] = []
  let index = 0

  while (index < pieces.length) {
    const circle = pieces[index]?.circle

    if (!circle) {
      nodes.push(pieces[index].node)
      index += 1
      continue
    }

    const groupedPieces = []
    let groupIndex = index

    while (groupIndex < pieces.length && pieces[groupIndex].circle?.id === circle.id) {
      groupedPieces.push(pieces[groupIndex])
      groupIndex += 1
    }

    if (start <= circle.start && end >= circle.end) {
      nodes.push(
        <span
          className="relative -mx-1 inline-block px-1"
          key={`circle-${circle.id}-${groupedPieces.map((piece) => piece.key).join('-')}`}
        >
          {groupedPieces.map((piece) => piece.node)}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1 -inset-y-0.5 rounded-[50%] border-2 shadow-[0_0_12px_currentColor]"
            style={{ borderColor: circle.color, color: circle.color }}
          />
        </span>,
      )
    } else {
      groupedPieces.forEach((piece) => nodes.push(piece.node))
    }

    index = groupIndex
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
