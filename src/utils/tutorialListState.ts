export interface TutorialListSnapshot {
  anchorSlug?: string
  anchorTop?: number
  categoryId: string
  difficulty: string
  query: string
  restorePending: boolean
  savedAt: number
  scrollY: number
  subcategoryId: string
  visibleCount: number
}

const tutorialListStateKey = 'scenemax:tutorial-list-state'

export function readTutorialListSnapshot() {
  if (typeof window === 'undefined') return undefined

  try {
    const rawSnapshot = window.sessionStorage.getItem(tutorialListStateKey)
    if (!rawSnapshot) return undefined

    const snapshot = JSON.parse(rawSnapshot) as Partial<TutorialListSnapshot>
    if (!snapshot || typeof snapshot !== 'object') return undefined

    return {
      anchorSlug: typeof snapshot.anchorSlug === 'string' ? snapshot.anchorSlug : undefined,
      anchorTop: typeof snapshot.anchorTop === 'number' && Number.isFinite(snapshot.anchorTop) ? snapshot.anchorTop : undefined,
      categoryId: typeof snapshot.categoryId === 'string' ? snapshot.categoryId : 'all',
      difficulty: typeof snapshot.difficulty === 'string' ? snapshot.difficulty : 'all',
      query: typeof snapshot.query === 'string' ? snapshot.query : '',
      restorePending: Boolean(snapshot.restorePending),
      savedAt: typeof snapshot.savedAt === 'number' ? snapshot.savedAt : 0,
      scrollY: typeof snapshot.scrollY === 'number' && Number.isFinite(snapshot.scrollY) ? snapshot.scrollY : 0,
      subcategoryId: typeof snapshot.subcategoryId === 'string' ? snapshot.subcategoryId : 'all',
      visibleCount:
        typeof snapshot.visibleCount === 'number' && Number.isFinite(snapshot.visibleCount)
          ? snapshot.visibleCount
          : 0,
    } satisfies TutorialListSnapshot
  } catch {
    return undefined
  }
}

export function saveTutorialListSnapshot(snapshot: TutorialListSnapshot) {
  if (typeof window === 'undefined') return

  window.sessionStorage.setItem(tutorialListStateKey, JSON.stringify(snapshot))
}

export function markTutorialListSnapshotRestored() {
  const snapshot = readTutorialListSnapshot()
  if (!snapshot) return

  saveTutorialListSnapshot({ ...snapshot, restorePending: false })
}
