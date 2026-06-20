import Fuse from 'fuse.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { SectionHeader } from '../components/SectionHeader'
import { TutorialCard, type TutorialCardSnapshotAnchor } from '../components/TutorialCard'
import { icons } from '../components/icons'
import type { Difficulty } from '../types/content'
import {
  difficulties,
  fetchTutorialContentIndex,
  formatDifficulty,
  staticTutorialContent,
} from '../utils/content'
import { usePageMeta } from '../utils/meta'
import {
  markTutorialListSnapshotRestored,
  readTutorialListSnapshot,
  saveTutorialListSnapshot,
  type TutorialListSnapshot,
} from '../utils/tutorialListState'

const allCategories = 'all'
const allSubcategories = 'all'
const allDifficulties = 'all'
const pageSize = 24

interface TutorialListLocationState {
  restoreTutorialList?: boolean
}

export function TutorialsPage() {
  const location = useLocation()
  const [initialSnapshot] = useState(() => {
    const savedSnapshot = readTutorialListSnapshot()
    const locationState = location.state as TutorialListLocationState | null
    const shouldRestore = Boolean(locationState?.restoreTutorialList || savedSnapshot?.restorePending)

    return shouldRestore ? savedSnapshot : undefined
  })

  const [tutorialContent, setTutorialContent] = useState(staticTutorialContent)
  const [query, setQuery] = useState(() => initialSnapshot?.query ?? '')
  const [categoryId, setCategoryId] = useState(() => initialSnapshot?.categoryId ?? allCategories)
  const [subcategoryId, setSubcategoryId] = useState(() => initialSnapshot?.subcategoryId ?? allSubcategories)
  const [difficulty, setDifficulty] = useState<Difficulty | typeof allDifficulties>(() =>
    normalizeDifficulty(initialSnapshot?.difficulty),
  )
  const [visibleCount, setVisibleCount] = useState(() => Math.max(pageSize, initialSnapshot?.visibleCount ?? pageSize))
  const SearchIcon = icons.search

  usePageMeta(
    'SceneMax3D Tutorials | Learn the 3D game engine',
    'Search and filter SceneMax3D tutorials by topic, tags, and difficulty.',
  )

  useEffect(() => {
    let isCurrent = true

    fetchTutorialContentIndex()
      .then((nextContent) => {
        if (isCurrent) {
          setTutorialContent(nextContent)
        }
      })
      .catch(() => {
        // Bundled tutorial content remains available when the runtime API is not present.
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const categoryTitleById = useMemo(
    () => new Map(tutorialContent.tutorialCategories.map((category) => [category.id, category.title])),
    [tutorialContent.tutorialCategories],
  )
  const subcategoryTitleById = useMemo(
    () => new Map(tutorialContent.tutorialSubcategories.map((subcategory) => [subcategory.id, subcategory.title])),
    [tutorialContent.tutorialSubcategories],
  )
  const orderedTutorials = useMemo(
    () => [...tutorialContent.tutorials].sort((a, b) => a.order - b.order),
    [tutorialContent.tutorials],
  )

  const searchableTutorials = useMemo(
    () =>
      orderedTutorials.map((tutorial) => ({
        ...tutorial,
        categoryTitle: categoryTitleById.get(tutorial.categoryId) ?? 'Uncategorized',
        subcategoryTitle: subcategoryTitleById.get(tutorial.subcategoryId) ?? 'General',
        searchText: [
          tutorial.title,
          tutorial.description,
          tutorial.subject,
          tutorial.clipFocus,
          tutorial.sourceDoc,
          tutorial.difficulty,
          categoryTitleById.get(tutorial.categoryId) ?? 'Uncategorized',
          subcategoryTitleById.get(tutorial.subcategoryId) ?? 'General',
          ...tutorial.tags,
        ].join(' '),
      })),
    [categoryTitleById, orderedTutorials, subcategoryTitleById],
  )

  const fuse = useMemo(
    () =>
      new Fuse(searchableTutorials, {
        keys: ['searchText'],
        ignoreLocation: true,
        threshold: 0.36,
      }),
    [searchableTutorials],
  )

  const results = useMemo(() => {
    const base = query.trim()
      ? fuse.search(query.trim()).map((result) => result.item)
      : searchableTutorials

    return base.filter((tutorial) => {
      const matchesCategory = categoryId === allCategories || tutorial.categoryId === categoryId
      const matchesSubcategory =
        subcategoryId === allSubcategories || tutorial.subcategoryId === subcategoryId
      const matchesDifficulty = difficulty === allDifficulties || tutorial.difficulty === difficulty

      return matchesCategory && matchesSubcategory && matchesDifficulty
    })
  }, [categoryId, difficulty, fuse, query, searchableTutorials, subcategoryId])

  const visibleResults = results.slice(0, visibleCount)

  const visibleSubcategories = useMemo(() => {
    if (categoryId === allCategories) {
      return tutorialContent.tutorialSubcategories
    }

    return tutorialContent.tutorialSubcategories.filter((subcategory) => subcategory.categoryId === categoryId)
  }, [categoryId, tutorialContent.tutorialSubcategories])

  function selectCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    setSubcategoryId(allSubcategories)
    setVisibleCount(pageSize)
  }

  const saveCurrentListSnapshot = useCallback(
    (restorePending: boolean, snapshotAnchor?: TutorialCardSnapshotAnchor) => {
      saveTutorialListSnapshot({
        anchorSlug: snapshotAnchor?.slug,
        anchorTop: snapshotAnchor?.top,
        categoryId,
        difficulty,
        query,
        restorePending,
        savedAt: Date.now(),
        scrollY: window.scrollY,
        subcategoryId,
        visibleCount,
      })
    },
    [categoryId, difficulty, query, subcategoryId, visibleCount],
  )

  useEffect(() => {
    saveCurrentListSnapshot(false)
  }, [saveCurrentListSnapshot])

  useLayoutEffect(() => {
    if (!initialSnapshot) return

    return restoreTutorialListScroll(initialSnapshot)
  }, [initialSnapshot])

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Tutorial academy"
          title="Search every SceneMax3D learning path"
          description="Find lessons by topic, difficulty, tags, category, or workflow."
        />

        <div className="mb-8 rounded-lg border border-white/10 bg-white/[0.045] p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.8fr]">
            <label className="relative block">
              <span className="sr-only">Search tutorials</span>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                className="min-h-12 w-full rounded-md border border-white/10 bg-slate-950/80 py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setVisibleCount(pageSize)
                }}
                placeholder="Search lessons, tags, systems..."
                type="search"
                value={query}
              />
            </label>

            <label>
              <span className="sr-only">Filter by category</span>
              <select
                className="min-h-12 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                onChange={(event) => selectCategory(event.target.value)}
                value={categoryId}
              >
                <option value={allCategories}>All categories</option>
                {tutorialContent.tutorialCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Filter by subcategory</span>
              <select
                className="min-h-12 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                onChange={(event) => {
                  setSubcategoryId(event.target.value)
                  setVisibleCount(pageSize)
                }}
                value={subcategoryId}
              >
                <option value={allSubcategories}>All subjects</option>
                {visibleSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Filter by difficulty</span>
              <select
                className="min-h-12 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                onChange={(event) => {
                  setDifficulty(event.target.value as Difficulty | typeof allDifficulties)
                  setVisibleCount(pageSize)
                }}
                value={difficulty}
              >
                <option value={allDifficulties}>All difficulties</option>
                {difficulties.map((item) => (
                  <option key={item} value={item}>
                    {formatDifficulty(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">
              Showing {Math.min(visibleCount, results.length)} of {results.length} lessons
            </span>
            {difficulties.map((item) => (
              <button
                className="rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-300"
                key={item}
                onClick={() => {
                  setDifficulty(difficulty === item ? allDifficulties : item)
                  setVisibleCount(pageSize)
                }}
                type="button"
              >
                <DifficultyBadge difficulty={item} />
              </button>
            ))}
          </div>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleResults.map((tutorial) => (
              <TutorialCard
                key={tutorial.id}
                onOpen={(snapshotAnchor) => saveCurrentListSnapshot(true, snapshotAnchor)}
                tutorial={tutorial}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-10 text-center">
            <h2 className="text-2xl font-black text-white">No lessons matched</h2>
            <p className="mt-3 text-slate-300">Try clearing a filter or searching for a broader topic.</p>
          </div>
        )}

        {visibleCount < results.length ? (
          <div className="mt-8 text-center">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              onClick={() => setVisibleCount((count) => count + pageSize)}
              type="button"
            >
              Show more lessons
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function normalizeDifficulty(value: string | undefined): Difficulty | typeof allDifficulties {
  if (value === allDifficulties) return allDifficulties
  if (difficulties.includes(value as Difficulty)) return value as Difficulty

  return allDifficulties
}

function restoreTutorialListScroll(snapshot: TutorialListSnapshot) {
  const root = document.documentElement
  const previousScrollBehavior = root.style.scrollBehavior
  const targetScrollY = Math.max(0, snapshot.scrollY)
  let secondFrame = 0

  function restore() {
    root.style.scrollBehavior = 'auto'
    window.scrollTo({ left: 0, top: targetScrollY, behavior: 'auto' })
    root.scrollTop = targetScrollY
    document.body.scrollTop = targetScrollY
    alignSnapshotAnchor(snapshot)
  }

  restore()
  const firstFrame = window.requestAnimationFrame(() => {
    restore()
    secondFrame = window.requestAnimationFrame(() => {
      restore()
      root.style.scrollBehavior = previousScrollBehavior
      markTutorialListSnapshotRestored()
    })
  })

  return () => {
    window.cancelAnimationFrame(firstFrame)
    window.cancelAnimationFrame(secondFrame)
    root.style.scrollBehavior = previousScrollBehavior
  }
}

function alignSnapshotAnchor(snapshot: TutorialListSnapshot) {
  if (!snapshot.anchorSlug || typeof snapshot.anchorTop !== 'number') return

  const targetHref = `/tutorials/${snapshot.anchorSlug}`
  const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/tutorials/"]')).find(
    (item) => item.getAttribute('href') === targetHref,
  )

  if (!anchor) return

  const topDelta = anchor.getBoundingClientRect().top - snapshot.anchorTop
  if (Math.abs(topDelta) < 0.5) return

  window.scrollBy({ left: 0, top: topDelta, behavior: 'auto' })
}
