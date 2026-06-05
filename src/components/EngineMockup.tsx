export function EngineMockup() {
  return (
    <div className="relative mx-auto aspect-[16/11] w-full max-w-2xl overflow-hidden rounded-lg border border-white/15 bg-slate-950 shadow-2xl shadow-cyan-950/40">
      <div className="flex h-9 items-center justify-between border-b border-white/10 bg-slate-900/95 px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>
        <div className="h-2 w-28 rounded-full bg-white/15" />
        <span className="h-2 w-10 rounded-full bg-cyan-300/50" aria-hidden="true" />
      </div>

      <div className="h-[calc(100%-2.25rem)] bg-slate-950">
        <img
          alt="SceneMax3D warrior gameplay preview"
          className="h-full w-full object-cover"
          src="/assets/warrior1.png"
        />
      </div>
    </div>
  )
}
