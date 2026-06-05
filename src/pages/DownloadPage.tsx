import {
  Apple,
  CheckCircle2,
  Download,
  ExternalLink,
  GitFork,
  MonitorDown,
  TerminalSquare,
} from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { siteContent } from '../utils/content'
import { usePageMeta } from '../utils/meta'

const repositoryUrl = 'https://github.com/scenemax3d/scenemax3d-desktop'
const releasesUrl = `${repositoryUrl}/releases`

const latestRelease = {
  version: 'v2.0.1',
  date: 'April 22, 2026',
  installerName: 'scenemax3d-2.0.1-setup.exe',
  installerSize: '343 MB',
  installerUrl:
    'https://github.com/scenemax3d/scenemax3d-desktop/releases/download/v2.0.1/scenemax3d-2.0.1-setup.exe',
  releaseUrl: `${releasesUrl}/tag/v2.0.1`,
  sourceZipUrl: `${repositoryUrl}/archive/refs/tags/v2.0.1.zip`,
}

const releases = [
  {
    version: 'v2.0.1',
    date: 'April 22, 2026',
    url: `${releasesUrl}/tag/v2.0.1`,
    summary:
      'Productivity and publishing release with built-in AI automation, project tooling, and runtime workflow improvements.',
    changes: [
      'MCP server support with more than 60 IDE automation tools and Local Gemma workflow support.',
      'Automatic upload of game artifacts to Itch.io.',
      'New configurable camera system, including first-person, third-person, fighting cameras, and camera modifiers.',
      'UI pop-up messages, UI MCP tools, project configuration, model auto-fit, and grammar performance improvements.',
      'Animation imports using MonkeyWrench plus packaging and deployment fixes.',
    ],
    installerUrl:
      'https://github.com/scenemax3d/scenemax3d-desktop/releases/download/v2.0.1/scenemax3d-2.0.1-setup.exe',
  },
  {
    version: 'v2.0.0',
    date: 'April 8, 2026',
    url: `${releasesUrl}/tag/v2.0.0`,
    summary:
      'First open release line for the current desktop studio, adding core creation systems and installer packaging.',
    changes: [
      'Font creation, Game UI, shader, runtime shader, and environment shader systems.',
      'Screen mode parsing with ANTLR and runtime fixes for audio teardown and UI image updates.',
      'Packaging and deployment work for Windows, Linux, and macOS plus initial Web Start support.',
      'Effekseer particle system support, effect rendering fixes, cinematic camera work, and documentation.',
      'Setup project work for the Windows installer.',
    ],
    installerUrl:
      'https://github.com/scenemax3d/scenemax3d-desktop/releases/download/v2.0.0/scenemax3d-2.0-setup.exe',
  },
]

const sourceSteps = [
  'Install Java 11 or later and Git.',
  'Clone the repository and enter the project folder.',
  'Copy the example configuration file if you need local service credentials.',
  'Build with the Gradle wrapper, then run the desktop app from source.',
]

const linuxCommands = `git clone https://github.com/scenemax3d/scenemax3d-desktop.git
cd scenemax3d-desktop
cp config.properties.example config.properties
./gradlew build
./gradlew run`

const macCommands = `git clone https://github.com/scenemax3d/scenemax3d-desktop.git
cd scenemax3d-desktop
chmod +x gradlew
cp config.properties.example config.properties
./gradlew build
./gradlew run`

function ExternalButton({
  children,
  href,
  variant = 'primary',
}: {
  children: React.ReactNode
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const className = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 ${
    variant === 'primary'
      ? 'bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(103,232,249,0.35)] hover:bg-cyan-200'
      : variant === 'secondary'
        ? 'border border-emerald-300/60 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20'
        : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
  }`

  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function CommandBlock({ commands }: { commands: string }) {
  return (
    <pre className="mt-5 overflow-x-auto rounded-lg border border-white/10 bg-slate-950 p-4 text-sm leading-7 text-slate-100">
      <code>{commands}</code>
    </pre>
  )
}

export function DownloadPage() {
  usePageMeta(
    `Download SceneMax3D | ${siteContent.site.name}`,
    'Download the latest Windows installer for SceneMax3D or build the open-source desktop studio from source on Linux and macOS.',
  )

  return (
    <>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.26em] text-cyan-200">
              Downloads
            </p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-5xl md:text-6xl">
              Get SceneMax3D {latestRelease.version}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 md:text-xl md:leading-8">
              Windows has a ready-to-use installer. Linux and macOS users can build the open-source desktop studio from the same release tag.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ExternalButton href={latestRelease.installerUrl}>
                <Download aria-hidden="true" size={18} />
                Download for Windows
              </ExternalButton>
              <ExternalButton href={latestRelease.sourceZipUrl} variant="secondary">
                <GitFork aria-hidden="true" size={18} />
                Source zip
              </ExternalButton>
              <ExternalButton href={latestRelease.releaseUrl} variant="ghost">
                <ExternalLink aria-hidden="true" size={18} />
                Release notes
              </ExternalButton>
            </div>
          </div>

          <aside className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] p-5 shadow-2xl shadow-cyan-950/25">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
                <MonitorDown aria-hidden="true" size={24} />
              </span>
              <div>
                <h2 className="text-2xl font-black text-white">Windows installer</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {latestRelease.installerName} · {latestRelease.installerSize} · published {latestRelease.date}
                </p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 border-y border-white/10 py-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-400">Version</dt>
                <dd className="mt-1 text-xl font-black text-white">{latestRelease.version}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-400">Platform</dt>
                <dd className="mt-1 text-xl font-black text-white">Windows</dd>
              </div>
            </dl>
            <p className="mt-5 text-sm leading-6 text-slate-300">
              After downloading, run the setup file and follow the installer prompts. For older installers, use the release history below.
            </p>
          </aside>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025] py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Linux and macOS"
            title="Build from source"
            description="The current prebuilt installer is Windows-only. On Linux and macOS, use Java 11+, Git, and the included Gradle wrapper."
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <article className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-md border border-emerald-300/35 bg-emerald-300/10 text-emerald-100">
                  <TerminalSquare aria-hidden="true" size={22} />
                </span>
                <h2 className="text-xl font-black text-white">Linux</h2>
              </div>
              <CommandBlock commands={linuxCommands} />
            </article>

            <article className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-md border border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100">
                  <Apple aria-hidden="true" size={22} />
                </span>
                <h2 className="text-xl font-black text-white">macOS</h2>
              </div>
              <CommandBlock commands={macCommands} />
            </article>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
            {sourceSteps.map((step) => (
              <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4" key={step}>
                <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-200" size={18} />
                <p className="text-sm leading-6 text-slate-300">{step}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">
            The build resolves ANTLR and other Gradle dependencies from Maven Central. If your shell blocks execution of the Gradle wrapper, run <code className="text-slate-200">chmod +x gradlew</code> and retry.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Release history"
            title="What changed in each release"
            description="The release notes below mirror the public GitHub releases and link back to the original entries."
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {releases.map((release) => (
              <article className="rounded-lg border border-white/10 bg-slate-950/70 p-5" key={release.version}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                      {release.date}
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">{release.version}</h2>
                  </div>
                  <a
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    href={release.installerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download aria-hidden="true" size={17} />
                    Windows
                  </a>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{release.summary}</p>
                <ul className="mt-5 space-y-3">
                  {release.changes.map((change) => (
                    <li className="flex gap-3 text-sm leading-6 text-slate-300" key={change}>
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-cyan-200" size={18} />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
                <a
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 transition hover:text-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  href={release.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View full GitHub release
                  <ExternalLink aria-hidden="true" size={16} />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
