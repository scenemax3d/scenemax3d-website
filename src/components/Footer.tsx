import { Link } from 'react-router-dom'
import { siteContent } from '../utils/content'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/90">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr] lg:px-8">
        <div>
          <h2 className="text-xl font-black text-white">{siteContent.site.name}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{siteContent.site.tagline}</p>
          <p className="mt-4 text-sm text-slate-500">{siteContent.site.license} license direction.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {siteContent.navigation.map((item) => (
            <Link
              className="rounded-md px-2 py-2 text-slate-300 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
              key={item.path}
              to={item.path}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
