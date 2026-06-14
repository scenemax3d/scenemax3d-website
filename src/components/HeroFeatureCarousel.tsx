import { useEffect, useState } from 'react'
import type { HeroCarouselSlide } from '../types/content'

const slideDuration = 5200

interface HeroFeatureCarouselProps {
  className?: string
  slides: HeroCarouselSlide[]
}

export function HeroFeatureCarousel({ className = '', slides }: HeroFeatureCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused || slides.length <= 1) {
      return
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length)
    }, slideDuration)

    return () => window.clearInterval(interval)
  }, [isPaused, slides.length])

  if (slides.length === 0) {
    return null
  }

  const activeSlide = slides[activeIndex]

  return (
    <section
      aria-label="SceneMax3D feature carousel"
      className={`relative mx-auto aspect-[16/11] w-full max-w-2xl overflow-hidden rounded-lg border border-white/15 bg-slate-950 shadow-2xl shadow-cyan-950/40 ${className}`}
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex h-9 items-center justify-between border-b border-white/10 bg-slate-900/95 px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>
        <div className="h-2 w-28 rounded-full bg-white/15" />
        <span className="h-2 w-10 rounded-full bg-cyan-300/50" aria-hidden="true" />
      </div>

      <div className="relative h-[calc(100%-2.25rem)] bg-slate-950">
        {slides.map((slide, index) => (
          <img
            alt={slide.imageAlt}
            aria-hidden={index !== activeIndex}
            className={`absolute inset-0 h-full w-full object-cover transition duration-700 ease-out ${
              index === activeIndex ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0'
            }`}
            key={slide.image}
            src={slide.image}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/5" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <div aria-live="polite" className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              {activeSlide.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">
              {activeSlide.title}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-200 sm:text-base">
              {activeSlide.description}
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2">
            {slides.map((slide, index) => (
              <button
                aria-label={`Show feature: ${slide.title}`}
                aria-pressed={index === activeIndex}
                className={`h-2.5 rounded-full transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                  index === activeIndex
                    ? 'w-9 bg-cyan-200'
                    : 'w-2.5 bg-white/35 hover:bg-white/60'
                }`}
                key={slide.title}
                onClick={() => setActiveIndex(index)}
                type="button"
              />
            ))}
          </div>
        </div>

        {!isPaused && slides.length > 1 ? (
          <span
            aria-hidden="true"
            className="hero-carousel-progress absolute bottom-0 left-0 h-1 bg-cyan-300"
            key={activeIndex}
          />
        ) : null}
      </div>
    </section>
  )
}
