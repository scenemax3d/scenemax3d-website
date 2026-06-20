import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentRoot = path.join(projectRoot, 'src/content')
const publicRoot = path.join(projectRoot, 'public')
const siteBasePath = path.join(contentRoot, 'siteBase.json')
const tutorialsPath = path.join(contentRoot, 'tutorials.json')
const samplesPath = path.join(contentRoot, 'tutorialSamples.json')
const categoriesPath = path.join(contentRoot, 'tutorialCategories.json')
const subcategoriesPath = path.join(contentRoot, 'tutorialSubcategories.json')
const scriptsRoot = path.join(contentRoot, 'tutorialScripts')
const tutorialAssetsRoot = path.join(publicRoot, 'assets/tutorials')
const maxJsonBodyBytes = Number.parseInt(process.env.ADMIN_API_MAX_BODY_BYTES ?? '', 10) || 30 * 1024 * 1024

export async function handleAdminApiRequest(req, res, url) {
  if (!url.pathname.startsWith('/api/admin/')) {
    return false
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/admin/tutorials') {
      await sendJson(res, {
        tutorials: await readJson(tutorialsPath),
        categories: await readJson(categoriesPath),
        subcategories: await readJson(subcategoriesPath),
      })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/assets') {
      await sendJson(res, { assets: await listTutorialAssets() })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/site') {
      await sendJson(res, await readSiteEditor())
      return true
    }

    const tutorialMatch = url.pathname.match(/^\/api\/admin\/tutorials\/([^/]+)$/)
    if (req.method === 'GET' && tutorialMatch) {
      await sendJson(res, await readTutorialDetail(tutorialMatch[1]))
      return true
    }

    if (req.method === 'PUT' && tutorialMatch) {
      const body = await readRequestJson(req)
      await writeTutorialDetail(tutorialMatch[1], body)
      await sendJson(res, await readTutorialDetail(tutorialMatch[1]))
      return true
    }

    if (req.method === 'DELETE' && tutorialMatch) {
      await deleteTutorialDetail(tutorialMatch[1])
      await sendJson(res, {
        tutorials: await readJson(tutorialsPath),
        categories: await readJson(categoriesPath),
        subcategories: await readJson(subcategoriesPath),
      })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/assets') {
      const body = await readRequestJson(req)
      await sendJson(res, await writeTutorialAsset(body))
      return true
    }

    if (req.method === 'PUT' && url.pathname === '/api/admin/site/hero-carousel') {
      const body = await readRequestJson(req)
      await sendJson(res, await writeHeroCarousel(body))
      return true
    }

    sendError(res, 404, 'Admin API route not found')
    return true
  } catch (error) {
    sendError(res, 500, error instanceof Error ? error.message : 'Unexpected admin API error')
    return true
  }
}

export async function handleContentApiRequest(req, res, url) {
  if (!url.pathname.startsWith('/api/content/')) {
    return false
  }

  try {
    if (req.method !== 'GET') {
      sendError(res, 405, 'Method not allowed')
      return true
    }

    if (url.pathname === '/api/content/tutorials') {
      await sendJson(res, await readTutorialContentIndex())
      return true
    }

    const tutorialMatch = url.pathname.match(/^\/api\/content\/tutorials\/([^/]+)$/)
    if (tutorialMatch) {
      const slug = sanitizeSlug(decodeURIComponent(tutorialMatch[1]))
      const content = await readTutorialContentIndex()
      const samples = await readJson(samplesPath)
      const tutorial = content.tutorials.find((item) => item.slug === slug)

      if (!tutorial) {
        sendError(res, 404, `Tutorial '${slug}' was not found`)
        return true
      }

      await sendJson(res, {
        ...content,
        sample: samples[tutorial.id] ?? { language: 'scenemax', caption: '', code: '' },
        script: await readTextIfExists(path.join(scriptsRoot, `${tutorial.id}.txt`)),
        tutorial,
      })
      return true
    }

    sendError(res, 404, 'Content API route not found')
    return true
  } catch (error) {
    sendError(res, 500, error instanceof Error ? error.message : 'Unexpected content API error')
    return true
  }
}

async function readTutorialContentIndex() {
  return {
    tutorials: await readJson(tutorialsPath),
    tutorialCategories: await readJson(categoriesPath),
    tutorialSubcategories: await readJson(subcategoriesPath),
  }
}

export async function listTutorialAssets() {
  const assets = []
  await walkAssets(tutorialAssetsRoot, assets)
  return assets.sort((a, b) => a.url.localeCompare(b.url))
}

export function sendError(res, statusCode, message) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: message }))
}

async function readSiteEditor() {
  const siteBase = await readJson(siteBasePath)

  return {
    heroCarousel: Array.isArray(siteBase.heroCarousel) ? siteBase.heroCarousel : [],
    assets: await listTutorialAssets(),
  }
}

async function writeHeroCarousel(body) {
  const payload = body
  validateHeroCarouselPayload(payload.heroCarousel)

  const siteBase = await readJson(siteBasePath)
  siteBase.heroCarousel = payload.heroCarousel
  await writeJson(siteBasePath, siteBase)

  return readSiteEditor()
}

function validateHeroCarouselPayload(value) {
  if (!Array.isArray(value)) {
    throw new Error('Hero carousel payload must be an array')
  }

  value.forEach((slide, index) => {
    if (!slide || typeof slide !== 'object') {
      throw new Error(`Hero carousel slide ${index + 1} is invalid`)
    }

    const fields = ['eyebrow', 'title', 'description', 'image', 'imageAlt']
    fields.forEach((field) => {
      if (typeof slide[field] !== 'string') {
        throw new Error(`Hero carousel slide ${index + 1} is missing string field '${field}'`)
      }
    })
  })
}

async function readTutorialDetail(rawId) {
  const id = sanitizePathPart(rawId)
  const tutorials = await readJson(tutorialsPath)
  const samples = await readJson(samplesPath)
  const tutorial = tutorials.find((item) => item.id === id)

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

async function writeTutorialDetail(rawId, body) {
  const id = sanitizePathPart(rawId)
  const payload = body

  if (!payload.tutorial || payload.tutorial.id !== id) {
    throw new Error('Saved tutorial payload does not match the selected tutorial')
  }

  validateTutorialPayload(payload.tutorial, id)

  const tutorials = await readJson(tutorialsPath)
  const tutorialIndex = tutorials.findIndex((item) => item.id === id)
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

async function deleteTutorialDetail(rawId) {
  const id = sanitizePathPart(rawId)
  const tutorials = await readJson(tutorialsPath)
  const tutorialIndex = tutorials.findIndex((item) => item.id === id)

  if (tutorialIndex < 0) {
    throw new Error(`Tutorial '${id}' was not found`)
  }

  tutorials.splice(tutorialIndex, 1)
  tutorials.forEach((tutorial) => {
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

function validateTutorialPayload(tutorial, id) {
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

function validateStringArray(value, id, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Tutorial '${id}' is missing string array field '${field}'`)
  }
}

async function writeTutorialAsset(body) {
  const payload = body
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

async function walkAssets(dir, assets) {
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
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

function getAssetType(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) return 'image'
  if (['.mp4', '.webm', '.mov'].includes(extension)) return 'video'
  return 'other'
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

async function readRequestJson(req) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length

    if (totalBytes > maxJsonBodyBytes) {
      throw new Error('Admin API request body is too large')
    }

    chunks.push(buffer)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function sendJson(res, value) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

function sanitizePathPart(value) {
  return value.replace(/[^a-z0-9-]/gi, '')
}

function sanitizeSlug(value) {
  return value.replace(/[^a-z0-9-]/gi, '')
}

function sanitizeFileName(value) {
  return value.replace(/[^a-z0-9._-]/gi, '-')
}

function sanitizeAssetPath(value) {
  return value
    .split(/[\\/]+/)
    .map((part) => sanitizeFileName(part))
    .filter(Boolean)
    .join('/')
}

function assertInside(root, target) {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to write outside the tutorial assets folder')
  }
}
