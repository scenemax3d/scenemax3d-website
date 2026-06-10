import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  FileText,
  Image,
  Play,
  RefreshCw,
  Save,
  Search,
  Tags,
  UploadCloud,
  Video,
  X,
} from 'lucide-react'
import type { ClipboardEvent, ReactNode, RefObject } from 'react'
import { TutorialScriptPlayer } from '../components/TutorialScriptPlayer'
import type {
  Difficulty,
  Tutorial,
  TutorialCategory,
  TutorialCodeSample,
  TutorialSubcategory,
} from '../types/content'
import { usePageMeta } from '../utils/meta'

interface TutorialAsset {
  name: string
  type: 'image' | 'video' | 'other'
  url: string
}

interface TutorialIndexResponse {
  tutorials: Tutorial[]
  categories: TutorialCategory[]
  subcategories: TutorialSubcategory[]
}

interface TutorialDetailResponse {
  tutorial: Tutorial
  sample: TutorialCodeSample
  script: string
  assets: TutorialAsset[]
}

interface AssetUploadResponse {
  url: string
  assets: TutorialAsset[]
}

const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced']

export function AdminTutorialEditorPage() {
  const [catalog, setCatalog] = useState<TutorialIndexResponse>({
    tutorials: [],
    categories: [],
    subcategories: [],
  })
  const [detail, setDetail] = useState<TutorialDetailResponse>()
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [assetFolder, setAssetFolder] = useState('getting-started')
  const [assetFile, setAssetFile] = useState<File>()
  const [tagsText, setTagsText] = useState('')
  const [relatedText, setRelatedText] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'uploading' | 'saved' | 'error'>(
    'idle',
  )
  const [message, setMessage] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null)

  usePageMeta(
    'Tutorial Admin | SceneMax3D',
    'Edit SceneMax3D tutorial content, scripts, samples, and media assets.',
  )

  useEffect(() => {
    loadCatalog()
  }, [])

  useEffect(() => {
    if (!selectedId) return
    loadDetail(selectedId)
  }, [selectedId])

  const filteredTutorials = useMemo(() => {
    const search = query.trim().toLowerCase()
    const tutorials = [...catalog.tutorials].sort((a, b) => a.order - b.order)
    if (!search) return tutorials

    return tutorials.filter((tutorial) =>
      [
        tutorial.title,
        tutorial.slug,
        tutorial.description,
        tutorial.categoryId,
        tutorial.subcategoryId,
        tutorial.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    )
  }, [catalog.tutorials, query])

  const visibleSubcategories = useMemo(() => {
    if (!detail) return catalog.subcategories
    return catalog.subcategories.filter((subcategory) => subcategory.categoryId === detail.tutorial.categoryId)
  }, [catalog.subcategories, detail])

  const relatedTitlesById = useMemo(
    () => new Map(catalog.tutorials.map((tutorial) => [tutorial.id, tutorial.title])),
    [catalog.tutorials],
  )

  async function loadCatalog() {
    setStatus('loading')
    setMessage('')

    try {
      const nextCatalog = await requestJson<TutorialIndexResponse>('/api/admin/tutorials')
      setCatalog(nextCatalog)
      setSelectedId((currentId) => currentId || nextCatalog.tutorials[0]?.id || '')
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  async function loadDetail(tutorialId: string) {
    setStatus('loading')
    setMessage('')

    try {
      const nextDetail = await requestJson<TutorialDetailResponse>(`/api/admin/tutorials/${tutorialId}`)
      setDetail(nextDetail)
      setTagsText(nextDetail.tutorial.tags.join(', '))
      setRelatedText(nextDetail.tutorial.relatedTutorialIds.join(', '))
      setAssetFolder(nextDetail.tutorial.categoryId || 'uploads')
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  async function saveDetail() {
    if (!detail) return

    setStatus('saving')
    setMessage('')

    const tutorial: Tutorial = {
      ...detail.tutorial,
      tags: splitList(tagsText),
      relatedTutorialIds: splitList(relatedText),
    }

    try {
      const savedDetail = await requestJson<TutorialDetailResponse>(`/api/admin/tutorials/${tutorial.id}`, {
        body: JSON.stringify({
          tutorial,
          sample: detail.sample,
          script: detail.script,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      })
      setDetail(savedDetail)
      setCatalog((current) => ({
        ...current,
        tutorials: current.tutorials.map((item) => (item.id === savedDetail.tutorial.id ? savedDetail.tutorial : item)),
      }))
      setStatus('saved')
      setMessage('Saved to JSON and text files.')
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  async function uploadAsset() {
    if (!assetFile || !detail) return

    setStatus('uploading')
    setMessage('')

    try {
      const uploaded = await uploadAssetFile(assetFile, assetFolder)

      setDetail({ ...detail, assets: uploaded.assets })
      setAssetFile(undefined)
      setStatus('saved')
      setMessage(`Uploaded ${uploaded.url}`)
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  async function pasteScriptImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!detail) return

    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length === 0) return

    event.preventDefault()

    const textarea = event.currentTarget
    const insertAt = textarea.selectionStart
    const replaceUntil = textarea.selectionEnd
    const folder = assetFolder

    setStatus('uploading')
    setMessage(`Uploading pasted image${imageFiles.length > 1 ? 's' : ''}...`)

    try {
      const uploadedImages = await Promise.all(
        imageFiles.map((file, index) =>
          uploadAssetFile(file, folder, createPastedImageFileName(file, index)),
        ),
      )
      const imageTags = uploadedImages.map((image) => `[img: ${image.url}]`).join('\n')
      const insertion = withLineBreakPadding(detail.script, insertAt, replaceUntil, imageTags)
      const nextCursorPosition = insertAt + insertion.length
      const latestAssets = uploadedImages[uploadedImages.length - 1].assets

      setDetail((current) =>
        current
          ? {
              ...current,
              script: insertTextAtSelection(current.script, insertAt, replaceUntil, insertion),
              assets: latestAssets,
            }
          : current,
      )
      setStatus('saved')
      setMessage(`Inserted ${uploadedImages.length} pasted image${uploadedImages.length > 1 ? 's' : ''}.`)
      window.requestAnimationFrame(() => {
        scriptTextareaRef.current?.focus()
        scriptTextareaRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition)
      })
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  function updateTutorial<K extends keyof Tutorial>(key: K, value: Tutorial[K]) {
    setDetail((current) =>
      current
        ? {
            ...current,
            tutorial: {
              ...current.tutorial,
              [key]: value,
            },
          }
        : current,
    )
  }

  function updateSample<K extends keyof TutorialCodeSample>(key: K, value: TutorialCodeSample[K]) {
    setDetail((current) =>
      current
        ? {
            ...current,
            sample: {
              ...current.sample,
              [key]: value,
            },
          }
        : current,
    )
  }

  function insertScriptMedia(asset: TutorialAsset) {
    if (!detail) return
    const command = asset.type === 'video' ? `[video: ${asset.url}]` : `[img: ${asset.url}]`
    setDetail({
      ...detail,
      script: [detail.script.trimEnd(), command].filter(Boolean).join('\n'),
    })
  }

  return (
    <section className="py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Admin</p>
            <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Tutorial Editor</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-emerald-300/50 bg-emerald-300/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/25 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!detail}
              onClick={() => setIsPreviewOpen(true)}
              type="button"
            >
              <Play aria-hidden="true" size={17} />
              Preview
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              onClick={() => selectedId && loadDetail(selectedId)}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={17} />
              Reload
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cyan-300/50 bg-cyan-300/15 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/25 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!detail || status === 'saving'}
              onClick={saveDetail}
              type="button"
            >
              <Save aria-hidden="true" size={17} />
              Save
            </button>
          </div>
        </div>

        {message ? (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm font-semibold ${
              status === 'error'
                ? 'border-rose-300/30 bg-rose-500/10 text-rose-100'
                : 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="h-fit overflow-hidden rounded-lg border border-white/10 bg-white/[0.045]">
            <div className="border-b border-white/10 p-4">
              <label className="relative block">
                <span className="sr-only">Search tutorials</span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                />
                <input
                  className="min-h-11 w-full rounded-md border border-white/10 bg-slate-950/80 py-2 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search lessons..."
                  type="search"
                  value={query}
                />
              </label>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-2">
              {filteredTutorials.map((tutorial) => (
                <button
                  className={`mb-1 w-full rounded-md border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                    selectedId === tutorial.id
                      ? 'border-cyan-300/50 bg-cyan-300/10'
                      : 'border-transparent hover:border-white/10 hover:bg-white/[0.045]'
                  }`}
                  key={tutorial.id}
                  onClick={() => setSelectedId(tutorial.id)}
                  type="button"
                >
                  <span className="block text-sm font-black text-white">{tutorial.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {tutorial.order} · {tutorial.categoryId} · {tutorial.difficulty}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {detail ? (
            <div className="grid gap-6">
              <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 md:p-5">
                <SectionTitle icon={<FileText aria-hidden="true" size={18} />} title="Metadata" />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TextField label="Title" value={detail.tutorial.title} onChange={(value) => updateTutorial('title', value)} />
                  <TextField label="Slug" value={detail.tutorial.slug} onChange={(value) => updateTutorial('slug', value)} />
                  <TextField label="Subject" value={detail.tutorial.subject} onChange={(value) => updateTutorial('subject', value)} />
                  <TextField label="Duration" value={detail.tutorial.duration} onChange={(value) => updateTutorial('duration', value)} />
                  <SelectField
                    label="Category"
                    value={detail.tutorial.categoryId}
                    onChange={(value) => updateTutorial('categoryId', value)}
                    options={catalog.categories.map((category) => ({ label: category.title, value: category.id }))}
                  />
                  <SelectField
                    label="Subcategory"
                    value={detail.tutorial.subcategoryId}
                    onChange={(value) => updateTutorial('subcategoryId', value)}
                    options={visibleSubcategories.map((subcategory) => ({
                      label: subcategory.title,
                      value: subcategory.id,
                    }))}
                  />
                  <SelectField
                    label="Difficulty"
                    value={detail.tutorial.difficulty}
                    onChange={(value) => updateTutorial('difficulty', value as Difficulty)}
                    options={difficulties.map((difficulty) => ({ label: formatDifficulty(difficulty), value: difficulty }))}
                  />
                  <NumberField
                    label="Order"
                    value={detail.tutorial.order}
                    onChange={(value) => updateTutorial('order', value)}
                  />
                  <TextField
                    label="Source doc"
                    value={detail.tutorial.sourceDoc}
                    onChange={(value) => updateTutorial('sourceDoc', value)}
                  />
                  <NumberField
                    label="Source line"
                    value={detail.tutorial.sourceLine ?? 0}
                    onChange={(value) => updateTutorial('sourceLine', value || undefined)}
                  />
                  <TextField
                    label="Thumbnail"
                    value={detail.tutorial.thumbnail}
                    onChange={(value) => updateTutorial('thumbnail', value)}
                  />
                  <TextField
                    label="YouTube ID"
                    value={detail.tutorial.youtubeId}
                    onChange={(value) => updateTutorial('youtubeId', value)}
                  />
                </div>
                <div className="mt-4 grid gap-4">
                  <TextAreaField
                    label="Description"
                    rows={3}
                    value={detail.tutorial.description}
                    onChange={(value) => updateTutorial('description', value)}
                  />
                  <TextAreaField
                    label="Clip focus"
                    rows={3}
                    value={detail.tutorial.clipFocus}
                    onChange={(value) => updateTutorial('clipFocus', value)}
                  />
                  <label className="inline-flex w-fit items-center gap-3 rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-200">
                    <input
                      checked={detail.tutorial.featured}
                      className="h-4 w-4 accent-cyan-300"
                      onChange={(event) => updateTutorial('featured', event.target.checked)}
                      type="checkbox"
                    />
                    Featured
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 md:p-5">
                <SectionTitle icon={<Tags aria-hidden="true" size={18} />} title="Tags and Links" />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TextAreaField label="Tags" rows={4} value={tagsText} onChange={setTagsText} />
                  <TextAreaField label="Related tutorial IDs" rows={4} value={relatedText} onChange={setRelatedText} />
                </div>
                {splitList(relatedText).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {splitList(relatedText).map((id) => (
                      <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs text-slate-300" key={id}>
                        {relatedTitlesById.get(id) ?? id}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 md:p-5">
                <SectionTitle icon={<FileText aria-hidden="true" size={18} />} title="Script and Sample" />
                <div className="mt-4 grid gap-4">
                  <TextAreaField
                    label="Tutorial script"
                    onPaste={pasteScriptImages}
                    rows={12}
                    textareaRef={scriptTextareaRef}
                    value={detail.script}
                    onChange={(value) => setDetail({ ...detail, script: value })}
                  />
                  <div className="-mt-2 flex justify-end gap-2">
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-emerald-300/50 bg-emerald-300/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/25 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setIsPreviewOpen(true)}
                      type="button"
                    >
                      <Play aria-hidden="true" size={16} />
                      Preview
                    </button>
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-cyan-300/50 bg-cyan-300/15 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/25 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={status === 'saving'}
                      onClick={saveDetail}
                      type="button"
                    >
                      <Save aria-hidden="true" size={16} />
                      Save
                    </button>
                  </div>
                  <TextField
                    label="Sample caption"
                    value={detail.sample.caption}
                    onChange={(value) => updateSample('caption', value)}
                  />
                  <TextAreaField
                    label="Sample code"
                    rows={10}
                    value={detail.sample.code}
                    onChange={(value) => updateSample('code', value)}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 md:p-5">
                <SectionTitle icon={<UploadCloud aria-hidden="true" size={18} />} title="Media Assets" />
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <TextField label="Asset folder" value={assetFolder} onChange={setAssetFolder} />
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      File
                    </span>
                    <input
                      accept="image/*,video/*"
                      className="block min-h-11 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                      onChange={(event) => setAssetFile(event.target.files?.[0])}
                      type="file"
                    />
                  </label>
                  <button
                    className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-300/50 bg-emerald-300/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/25 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 md:mt-6"
                    disabled={!assetFile || status === 'uploading'}
                    onClick={uploadAsset}
                    type="button"
                  >
                    <UploadCloud aria-hidden="true" size={17} />
                    Upload
                  </button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {detail.assets.map((asset) => (
                    <div
                      className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-3 sm:grid-cols-[86px_1fr]"
                      key={asset.url}
                    >
                      <AssetPreview asset={asset} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{asset.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{asset.url}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {asset.type === 'image' || asset.type === 'video' ? (
                            <button
                              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                              onClick={() => insertScriptMedia(asset)}
                              type="button"
                            >
                              {asset.type === 'video' ? (
                                <Video aria-hidden="true" size={15} />
                              ) : (
                                <Image aria-hidden="true" size={15} />
                              )}
                              Insert
                            </button>
                          ) : null}
                          {asset.type === 'image' ? (
                            <button
                              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                              onClick={() => updateTutorial('thumbnail', asset.url)}
                              type="button"
                            >
                              <Check aria-hidden="true" size={15} />
                              Thumbnail
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.045] p-8 text-slate-300">
              {status === 'loading' ? 'Loading...' : 'Select a tutorial.'}
            </div>
          )}
        </div>
      </div>

      {detail && isPreviewOpen ? (
        <div
          aria-labelledby="tutorial-preview-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white/10 bg-slate-950 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 md:px-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Clip preview</p>
                <h2 className="truncate text-xl font-black text-white" id="tutorial-preview-title">
                  {detail.tutorial.title}
                </h2>
              </div>
              <button
                aria-label="Close preview"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                onClick={() => setIsPreviewOpen(false)}
                title="Close preview"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="p-4 md:p-5">
              <TutorialScriptPlayer
                key={`admin-preview-${detail.tutorial.id}`}
                scriptText={detail.script}
                tutorial={{
                  ...detail.tutorial,
                  relatedTutorialIds: splitList(relatedText),
                  tags: splitList(tagsText),
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
        {icon}
      </span>
      <h2 className="text-lg font-black text-white">{title}</h2>
    </div>
  )
}

function TextField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <input
        className="min-h-11 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: number) => void
  value: number
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <input
        className="min-h-11 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  )
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <select
        className="min-h-11 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextAreaField({
  label,
  onChange,
  onPaste,
  rows,
  textareaRef,
  value,
}: {
  label: string
  onChange: (value: string) => void
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  rows: number
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  value: string
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <textarea
        className="w-full resize-y rounded-md border border-white/10 bg-slate-950/80 px-3 py-3 font-mono text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        ref={textareaRef}
        rows={rows}
        value={value}
      />
    </label>
  )
}

function AssetPreview({ asset }: { asset: TutorialAsset }) {
  if (asset.type === 'image') {
    return <img alt="" className="h-20 w-full rounded-md bg-slate-900 object-cover" src={asset.url} />
  }

  if (asset.type === 'video') {
    return (
      <video
        className="h-20 w-full rounded-md bg-slate-900 object-cover"
        muted
        playsInline
        src={asset.url}
      />
    )
  }

  return (
    <div className="grid h-20 w-full place-items-center rounded-md bg-slate-900 text-slate-500">
      <FileText aria-hidden="true" size={20} />
    </div>
  )
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error ?? 'Request failed')
  }

  return body as T
}

async function uploadAssetFile(file: File, folder: string, fileName = file.name) {
  return requestJson<AssetUploadResponse>('/api/admin/assets', {
    body: JSON.stringify({
      base64: await readFileAsBase64(file),
      fileName,
      folder,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

function splitList(value: string) {
  return value
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDifficulty(value: Difficulty) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error'
}

function createPastedImageFileName(file: File, index: number) {
  const extension = getImageExtension(file.type) || getFileExtension(file.name) || 'png'
  const suffix = index > 0 ? `-${index + 1}` : ''
  return `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}${suffix}.${extension}`
}

function getImageExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/svg+xml') return 'svg'
  return ''
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return extension && extension !== fileName.toLowerCase() ? extension : ''
}

function withLineBreakPadding(
  text: string,
  start: number,
  end: number,
  insertion: string,
) {
  const needsLeadingBreak = start > 0 && text.charAt(start - 1) !== '\n'
  const needsTrailingBreak = end < text.length && text.charAt(end) !== '\n'

  return `${needsLeadingBreak ? '\n' : ''}${insertion}${needsTrailingBreak ? '\n' : ''}`
}

function insertTextAtSelection(text: string, start: number, end: number, insertion: string) {
  return text.slice(0, start) + insertion + text.slice(end)
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read selected file'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.readAsDataURL(file)
  })
}
