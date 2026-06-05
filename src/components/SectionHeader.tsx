interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
}

export function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="mx-auto mb-8 max-w-3xl text-center md:mb-12">
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-black text-white md:text-5xl">{title}</h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-slate-300 md:text-lg">{description}</p>
      ) : null}
    </div>
  )
}
