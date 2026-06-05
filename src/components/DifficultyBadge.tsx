import type { Difficulty } from '../types/content'
import { formatDifficulty } from '../utils/content'

interface DifficultyBadgeProps {
  difficulty: Difficulty
}

const classes: Record<Difficulty, string> = {
  beginner: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100',
  intermediate: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100',
  advanced: 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100',
}

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${classes[difficulty]}`}
    >
      {formatDifficulty(difficulty)}
    </span>
  )
}
