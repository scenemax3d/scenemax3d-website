import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

const contentRoot = path.resolve(__dirname, 'src/content')
const publicRoot = path.resolve(__dirname, 'public')
const tutorialsPath = path.join(contentRoot, 'tutorials.json')
const samplesPath = path.join(contentRoot, 'tutorialSamples.json')
const categoriesPath = path.join(contentRoot, 'tutorialCategories.json')
const subcategoriesPath = path.join(contentRoot, 'tutorialSubcategories.json')
const scriptsRoot = path.join(contentRoot, 'tutorialScripts')
const tutorialAssetsRoot = path.join(publicRoot, 'assets/tutorials')

// https://vite.dev/config/
export default defineConfig({
  plugins: [tutorialAdminApi(), react(), tailwindcss()],
})

function tutorialAdminApi() {
  return {
    name: 'tutorial-admin-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost') : undefined

        if (!url?.pathname.startsWith('/api/admin/')) {
          next()
          return
        }

        try {
          if (req.method === 'GET' && url.pathname === '/api/admin/tutorials') {
            await sendJson(res, {
              tutorials: await readJson(tutorialsPath),
              categories: await readJson(categoriesPath),
              subcategories: await readJson(subcategoriesPath),
            })
            return
          }

          if (req.method === 'GET' && url.pathname === '/api/admin/assets') {
            await sendJson(res, { assets: await listTutorialAssets() })
            return
          }

          const tutorialMatch = url.pathname.match(/^\/api\/admin\/tutorials\/([^/]+)$/)
          if (req.method === 'GET' && tutorialMatch) {
            await sendJson(res, await readTutorialDetail(tutorialMatch[1]))
            return
          }

          if (req.method === 'PUT' && tutorialMatch) {
            const body = await readRequestJson(req)
            await writeTutorialDetail(tutorialMatch[1], body)
            await sendJson(res, await readTutorialDetail(tutorialMatch[1]))
            return
          }

          if (req.method === 'DELETE' && tutorialMatch) {
            await deleteTutorialDetail(tutorialMatch[1])
            await sendJson(res, {
              tutorials: await readJson(tutorialsPath),
              categories: await readJson(categoriesPath),
              subcategories: await readJson(subcategoriesPath),
            })
            return
          }

          if (req.method === 'POST' && url.pathname === '/api/admin/assets') {
            const body = await readRequestJson(req)
            await sendJson(res, await writeTutorialAsset(body))
            return
          }

          sendError(res, 404, 'Admin API route not found')
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Unexpected admin API error')
        }
      })
    },
  }
}

async function readTutorialDetail(rawId: string) {
  const id = sanitizePathPart(rawId)
  const tutorials = await readJson(tutorialsPath)
  const samples = await readJson(samplesPath)
  const tutorial = tutorials.find((item: { id: string }) => item.id === id)

  if (!tutorial) {
    throw new Error(`Tutorial '${id}' was not found`)
  }

  return {
    tutorial,
    sample: samples[id] ?? { language: 'scenemax', caption: '', code: '' },
    script: await readTextIfExists(path.join(scriptsRoot, `${id}.txt`)),
    assets: await listTutorialAssets(),
  }
}

async function writeTutorialDetail(rawId: string, body: unknown) {
  const id = sanitizePathPart(rawId)
  const payload = body as {
    tutorial?: Record<string, unknown>
    sample?: Record<string, unknown>
    script?: string
  }

  if (!payload.tutorial || payload.tutorial.id !== id) {
    throw new Error('Saved tutorial payload does not match the selected tutorial')
  }

  validateTutorialPayload(payload.tutorial, id)

  const tutorials = await readJson(tutorialsPath)
  const tutorialIndex = tutorials.findIndex((item: { id: string }) => item.id === id)
  if (tutorialIndex < 0) {
    throw new Error(`Tutorial '${id}' was not found`)
  }

  tutorials[tutorialIndex] = payload.tutorial
  await writeJson(tutorialsPath, tutorials)

  const samples = await readJson(samplesPath)
  samples[id] = {
    language: 'scenemax',
    caption: String(payload.sample?.caption ?? ''),
    code: String(payload.sample?.code ?? ''),
  }
  await writeJson(samplesPath, samples)

  await fs.mkdir(scriptsRoot, { recursive: true })
  await fs.writeFile(path.join(scriptsRoot, `${id}.txt`), String(payload.script ?? '').trimEnd() + '\n')
}

async function deleteTutorialDetail(rawId: string) {
  const id = sanitizePathPart(rawId)
  const tutorials = await readJson(tutorialsPath)
  const tutorialIndex = tutorials.findIndex((item: { id: string }) => item.id === id)

  if (tutorialIndex < 0) {
    throw new Error(`Tutorial '${id}' was not found`)
  }

  tutorials.splice(tutorialIndex, 1)
  tutorials.forEach((tutorial: { relatedTutorialIds?: string[] }) => {
    if (Array.isArray(tutorial.relatedTutorialIds)) {
      tutorial.relatedTutorialIds = tutorial.relatedTutorialIds.filter((relatedId) => relatedId !== id)
    }
  })
  await writeJson(tutorialsPath, tutorials)

  const samples = await readJson(samplesPath)
  delete samples[id]
  await writeJson(samplesPath, samples)

  await fs.rm(path.join(scriptsRoot, `${id}.txt`), { force: true })
}

function validateTutorialPayload(tutorial: Record<string, unknown>, id: string) {
  const stringFields = [
    'id',
    'slug',
    'title',
    'description',
    'categoryId',
    'subcategoryId',
    'subject',
    'clipFocus',
    'sourceDoc',
    'difficulty',
    'duration',
    'youtubeId',
    'thumbnail',
  ]

  stringFields.forEach((field) => {
    if (typeof tutorial[field] !== 'string') {
      throw new Error(`Tutorial '${id}' is missing string field '${field}'`)
    }
  })

  if (!['beginner', 'intermediate', 'advanced'].includes(String(tutorial.difficulty))) {
    throw new Error(`Tutorial '${id}' has an invalid difficulty`)
  }

  if (typeof tutorial.featured !== 'boolean') {
    throw new Error(`Tutorial '${id}' is missing boolean field 'featured'`)
  }

  if (typeof tutorial.order !== 'number' || !Number.isFinite(tutorial.order)) {
    throw new Error(`Tutorial '${id}' is missing numeric field 'order'`)
  }

  if (
    tutorial.sourceLine !== undefined &&
    (typeof tutorial.sourceLine !== 'number' || !Number.isFinite(tutorial.sourceLine))
  ) {
    throw new Error(`Tutorial '${id}' has an invalid sourceLine`)
  }

  validateStringArray(tutorial.tags, id, 'tags')
  validateStringArray(tutorial.relatedTutorialIds, id, 'relatedTutorialIds')
}

function validateStringArray(value: unknown, id: string, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Tutorial '${id}' is missing string array field '${field}'`)
  }
}

async function writeTutorialAsset(body: unknown) {
  const payload = body as {
    folder?: string
    fileName?: string
    base64?: string
  }
  const folder = sanitizeAssetPath(payload.folder || 'uploads')
  const fileName = sanitizeFileName(payload.fileName || 'asset.bin')

  if (!payload.base64) {
    throw new Error('Missing uploaded file data')
  }

  const targetDir = path.join(tutorialAssetsRoot, folder)
  const targetPath = path.join(targetDir, fileName)
  assertInside(tutorialAssetsRoot, targetPath)
  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(targetPath, Buffer.from(payload.base64, 'base64'))

  return {
    url: `/assets/tutorials/${folder}/${fileName}`.replaceAll('\\', '/'),
    assets: await listTutorialAssets(),
  }
}

async function listTutorialAssets() {
  const assets: Array<{ url: string; name: string; type: 'image' | 'video' | 'other' }> = []
  await walkAssets(tutorialAssetsRoot, assets)
  return assets.sort((a, b) => a.url.localeCompare(b.url))
}

async function walkAssets(
  dir: string,
  assets: Array<{ url: string; name: string; type: 'image' | 'video' | 'other' }>,
) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walkAssets(entryPath, assets)
          return
        }

        if (!entry.isFile()) return

        const relativePath = path.relative(tutorialAssetsRoot, entryPath).replaceAll('\\', '/')
        assets.push({
          name: entry.name,
          type: getAssetType(entry.name),
          url: `/assets/tutorials/${relativePath}`,
        })
      }),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function getAssetType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) return 'image'
  if (['.mp4', '.webm', '.mov'].includes(extension)) return 'video'
  return 'other'
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function readTextIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

async function readRequestJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function sendJson(res: ServerResponse, value: unknown) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

function sendError(res: ServerResponse, statusCode: number, message: string) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: message }))
}

function sanitizePathPart(value: string) {
  return value.replace(/[^a-z0-9-]/gi, '')
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, '-')
}

function sanitizeAssetPath(value: string) {
  return value
    .split(/[\\/]+/)
    .map((part) => sanitizeFileName(part))
    .filter(Boolean)
    .join('/')
}

function assertInside(root: string, target: string) {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to write outside the tutorial assets folder')
  }
}
