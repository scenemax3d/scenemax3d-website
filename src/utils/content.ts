import rawSiteBase from '../content/siteBase.json'
import rawTutorialCategories from '../content/tutorialCategories.json'
import rawTutorialSubcategories from '../content/tutorialSubcategories.json'
import rawTutorials from '../content/tutorials.json'
import type {
  Difficulty,
  SiteContent,
  Tutorial,
  TutorialCategory,
  TutorialCodeSample,
  TutorialSubcategory,
} from '../types/content'

const rawTutorialScripts = import.meta.glob('../content/tutorialScripts/*.txt', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const tutorialScriptsById = new Map(
  Object.entries(rawTutorialScripts).map(([path, script]) => {
    const id = path.split('/').pop()?.replace(/\.txt$/, '') ?? path
    return [id, script.trim()]
  }),
)

export const siteContent = {
  ...rawSiteBase,
  tutorialCategories: rawTutorialCategories,
  tutorialSubcategories: rawTutorialSubcategories,
  tutorials: rawTutorials,
} as SiteContent

export interface TutorialContentIndex {
  tutorialCategories: TutorialCategory[]
  tutorialSubcategories: TutorialSubcategory[]
  tutorials: Tutorial[]
}

export interface TutorialContentDetail extends TutorialContentIndex {
  sample: TutorialCodeSample
  script: string
  tutorial: Tutorial
}

export const staticTutorialContent: TutorialContentIndex = {
  tutorialCategories: siteContent.tutorialCategories,
  tutorialSubcategories: siteContent.tutorialSubcategories,
  tutorials: siteContent.tutorials,
}

export const categoriesById = new Map(
  siteContent.tutorialCategories.map((category) => [category.id, category]),
)

export const subcategoriesById = new Map(
  siteContent.tutorialSubcategories.map((subcategory) => [subcategory.id, subcategory]),
)

export const orderedSubcategories = [...siteContent.tutorialSubcategories].sort(
  (a, b) => a.order - b.order,
)

export const orderedTutorials = [...siteContent.tutorials].sort(
  (a, b) => a.order - b.order,
)

export const featuredTutorials = orderedTutorials.filter(
  (tutorial) => tutorial.featured,
)

export const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced']

export function getCategoryTitle(categoryId: string) {
  return categoriesById.get(categoryId)?.title ?? 'Uncategorized'
}

export function getSubcategoryTitle(subcategoryId: string) {
  return subcategoriesById.get(subcategoryId)?.title ?? 'General'
}

export function getSubcategoriesForCategory(categoryId: string) {
  return orderedSubcategories.filter((subcategory) => subcategory.categoryId === categoryId)
}

export function findTutorialBySlug(slug: string | undefined) {
  return orderedTutorials.find((tutorial) => tutorial.slug === slug)
}

export function getTutorialNeighbors(tutorial: Tutorial) {
  const index = orderedTutorials.findIndex((item) => item.id === tutorial.id)

  return {
    previous: index > 0 ? orderedTutorials[index - 1] : undefined,
    next: index >= 0 && index < orderedTutorials.length - 1 ? orderedTutorials[index + 1] : undefined,
  }
}

export function getRelatedTutorials(tutorial: Tutorial) {
  return tutorial.relatedTutorialIds
    .map((id) => orderedTutorials.find((item) => item.id === id))
    .filter((item): item is Tutorial => Boolean(item))
}

export function getTutorialScript(tutorial: Tutorial) {
  return tutorialScriptsById.get(tutorial.id) ?? tutorial.tutorialScript?.trim() ?? ''
}

export function getFirstTutorialScriptImage(script: string) {
  return script.match(/\[img[12]?\s*:\s*([^\]]+)\]/i)?.[1]?.trim() ?? ''
}

export function getTutorialPreviewImage(tutorial: Tutorial) {
  return getFirstTutorialScriptImage(getTutorialScript(tutorial)) || tutorial.thumbnail
}

export function formatDifficulty(difficulty: Difficulty) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

export async function fetchTutorialContentIndex() {
  return fetchRuntimeJson<TutorialContentIndex>('/api/content/tutorials')
}

export async function fetchTutorialContentDetail(slug: string) {
  return fetchRuntimeJson<TutorialContentDetail>(`/api/content/tutorials/${encodeURIComponent(slug)}`)
}

async function fetchRuntimeJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Runtime content request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}
