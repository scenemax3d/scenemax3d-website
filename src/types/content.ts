export type CtaVariant = 'primary' | 'secondary' | 'ghost'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface NavigationItem {
  label: string
  path: string
}

export interface CtaLink {
  label: string
  url: string
  variant: CtaVariant
}

export interface SiteContent {
  site: {
    name: string
    tagline: string
    description: string
    githubUrl: string
    license: string
  }
  navigation: NavigationItem[]
  hero: {
    eyebrow: string
    title: string
    subtitle: string
    buttons: CtaLink[]
    stats: Array<{
      value: string
      label: string
    }>
  }
  creatorAudiences: Array<{
    title: string
    description: string
    icon: string
  }>
  features: Array<{
    title: string
    description: string
    icon: string
  }>
  languagePreview: {
    title: string
    description: string
    code: string
  }
  showcase: Array<{
    title: string
    description: string
    status: string
  }>
  tutorialCategories: TutorialCategory[]
  tutorialSubcategories: TutorialSubcategory[]
  tutorials: Tutorial[]
}

export interface TutorialCategory {
  id: string
  title: string
  description: string
  order: number
}

export interface TutorialSubcategory {
  id: string
  categoryId: string
  title: string
  description: string
  order: number
}

export interface Tutorial {
  id: string
  slug: string
  title: string
  description: string
  categoryId: string
  subcategoryId: string
  subject: string
  clipFocus: string
  sourceDoc: string
  sourceLine?: number
  difficulty: Difficulty
  duration: string
  youtubeId: string
  tutorialScript?: string
  thumbnail: string
  tags: string[]
  featured: boolean
  order: number
  relatedTutorialIds: string[]
}

export interface TutorialCodeSample {
  language: 'scenemax'
  caption: string
  code: string
}
