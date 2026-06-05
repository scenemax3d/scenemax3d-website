import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DownloadPage } from './pages/DownloadPage'
import { HomePage } from './pages/HomePage'
import { SimplePage } from './pages/SimplePage'
import { TutorialDetailPage } from './pages/TutorialDetailPage'
import { TutorialsPage } from './pages/TutorialsPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="tutorials" element={<TutorialsPage />} />
        <Route path="tutorials/:slug" element={<TutorialDetailPage />} />
        <Route
          path="docs"
          element={
            <SimplePage
              description="Documentation pages will be driven by the same JSON structure as the tutorials."
              eyebrow="Docs"
              items={['SceneMax language reference', 'Studio workflow notes', 'Component guides', 'Publishing checklist']}
              title="Documentation"
            />
          }
        />
        <Route path="download" element={<DownloadPage />} />
        <Route
          path="showcase"
          element={
            <SimplePage
              description="A gallery for finished games, demos, screenshots, videos, and sample scenes."
              eyebrow="Showcase"
              items={['Dragon Gate', 'Starter Platformer', 'Animation Lab', 'Scene gallery']}
              title="Showcase"
            />
          }
        />
        <Route
          path="community"
          element={
            <SimplePage
              description="Community links, contribution guidance, discussions, and open-source project information."
              eyebrow="Community"
              items={['GitHub', 'Discussions', 'Contribution guide', 'Learning support']}
              title="Community"
            />
          }
        />
        <Route
          path="roadmap"
          element={
            <SimplePage
              description="A public roadmap for upcoming SceneMax3D website, academy, and engine milestones."
              eyebrow="Roadmap"
              items={['Phase 2 polish', 'Phase 3 content', 'Docs expansion', 'Learning paths']}
              title="Roadmap"
            />
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  )
}

export default App
