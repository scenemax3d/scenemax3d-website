import { Link } from 'react-router-dom'
import { icons } from './icons'
import type { CtaLink } from '../types/content'

interface CtaButtonProps {
  link: CtaLink
}

export function CtaButton({ link }: CtaButtonProps) {
  const isExternal = link.url.startsWith('http')
  const GitHubIcon = icons.github
  const DownloadIcon = icons.download
  const PlayIcon = icons.play
  const Icon =
    link.label.toLowerCase().includes('github')
      ? GitHubIcon
      : link.label.toLowerCase().includes('download')
        ? DownloadIcon
        : PlayIcon

  const className = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 ${
    link.variant === 'primary'
      ? 'bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(103,232,249,0.35)] hover:bg-cyan-200'
      : link.variant === 'secondary'
        ? 'border border-emerald-300/60 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'
        : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
  }`

  if (isExternal) {
    return (
      <a className={className} href={link.url} target="_blank" rel="noreferrer">
        <Icon aria-hidden="true" size={18} />
        {link.label}
      </a>
    )
  }

  return (
    <Link className={className} to={link.url}>
      <Icon aria-hidden="true" size={18} />
      {link.label}
    </Link>
  )
}
