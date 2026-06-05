import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { siteContent } from '../utils/content'
import { icons } from './icons'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const MenuIcon = icons.menu
  const XIcon = icons.x
  const StudioIcon = icons.studio

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          className="flex min-w-0 items-center gap-3 font-black text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
          to="/"
          onClick={() => setIsOpen(false)}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan-300/45 bg-cyan-300/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.3)]">
            <StudioIcon aria-hidden="true" size={20} />
          </span>
          <span className="truncate text-lg">{siteContent.site.name}</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {siteContent.navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                  isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
              key={item.path}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <a
          className="hidden min-h-10 items-center justify-center rounded-md border border-cyan-300/50 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300 md:inline-flex"
          href={siteContent.site.githubUrl}
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>

        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="grid h-11 w-11 place-items-center rounded-md border border-white/15 bg-white/5 text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 lg:hidden"
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          {isOpen ? <XIcon aria-hidden="true" size={22} /> : <MenuIcon aria-hidden="true" size={22} />}
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-white/10 bg-slate-950 px-4 py-4 lg:hidden">
          <div className="mx-auto grid max-w-7xl gap-2">
            {siteContent.navigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-3 text-base font-semibold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
                key={item.path}
                onClick={() => setIsOpen(false)}
                to={item.path}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}
