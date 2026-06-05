import Fuse from 'fuse.js'
import { useMemo, useState } from 'react'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { SectionHeader } from '../components/SectionHeader'
import { TutorialCard } from '../components/TutorialCard'
import { icons } from '../components/icons'
import type { Difficulty } from '../types/content'
import {
  difficulties,
  formatDifficulty,
  getCategoryTitle,
  getSubcategoriesForCategory,
  getSubcategoryTitle,
  orderedTutorials,
  siteContent,
} from '../utils/content'
import { usePageMeta } from '../utils/meta'

const allCategories = 'all'
const allSubcategories = 'all'
const allDifficulties = 'all'
const pageSize = 24

export function TutorialsPage() {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState(allCategories)
  const [subcategoryId, setSubcategoryId] = useState(allSubcategories)
  const [difficulty, setDifficulty] = useState<Difficulty | typeof allDifficulties>(allDifficulties)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const SearchIcon = icons.search

  usePageMeta(
    'SceneMax3D Tutorials | Learn the 3D game engine',
    'Search and filter SceneMax3D tutorials by topic, tags, and difficulty.',
  )

  const searchableTutorials = useMemo(
    () =>
      orderedTutorials.map((tutorial) => ({
        ...tutorial,
        categoryTitle: getCategoryTitle(tutorial.categoryId),
        subcategoryTitle: getSubcategoryTitle(tutorial.subcategoryId),
        searchText: [
          tutorial.title,
          tutorial.description,
          tutorial.subject,
          tutorial.clipFocus,
          tutorial.sourceDoc,
          tutorial.difficulty,
          getCategoryTitle(tutorial.categoryId),
          getSubcategoryTitle(tutorial.subcategoryId),
          ...tutorial.tags,
        ].join(' '),
      })),
    [],
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
      return siteContent.tutorialSubcategories
    }

    return getSubcategoriesForCategory(categoryId)
  }, [categoryId])

  function selectCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    setSubcategoryId(allSubcategories)
    setVisibleCount(pageSize)
  }

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Tutorial academy"
          title="Search every SceneMax3D learning path"
          description="Find lessons by topic, difficulty, tags, category, or workflow. Add YouTube IDs in the JSON file as videos are published."
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
                {siteContent.tutorialCategories.map((category) => (
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

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {siteContent.tutorialCategories.map((category) => (
            <button
              className={`rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                categoryId === category.id
                  ? 'border-cyan-300/60 bg-cyan-300/10'
                  : 'border-white/10 bg-white/[0.035] hover:border-cyan-300/30'
              }`}
              key={category.id}
              onClick={() => selectCategory(categoryId === category.id ? allCategories : category.id)}
              type="button"
            >
              <h3 className="font-black text-white">{category.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{category.description}</p>
            </button>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {visibleSubcategories.map((subcategory) => (
            <button
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                subcategoryId === subcategory.id
                  ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-100'
                  : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-emerald-300/35'
              }`}
              key={subcategory.id}
              onClick={() => {
                setSubcategoryId(
                  subcategoryId === subcategory.id ? allSubcategories : subcategory.id,
                )
                setVisibleCount(pageSize)
              }}
              type="button"
            >
              {subcategory.title}
            </button>
          ))}
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleResults.map((tutorial) => (
              <TutorialCard key={tutorial.id} tutorial={tutorial} />
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
