import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleAdminApiRequest, handleContentApiRequest, sendError } from './adminApi.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(projectRoot, 'dist')
const publicRoot = path.join(projectRoot, 'public')
const indexPath = path.join(distRoot, 'index.html')
const host = process.env.HOST || '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '', 10) || 8080
const adminUsername = process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.ADMIN_PASSWORD || ''
const hasAdminAuth = Boolean(adminUsername && adminPassword)

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const server = http.createServer(async (req, res) => {
  const url = req.url ? new URL(req.url, `http://${req.headers.host ?? 'localhost'}`) : new URL('/', 'http://localhost')

  try {
    if (url.pathname === '/healthz') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname.startsWith('/api/content/')) {
      await handleContentApiRequest(req, res, url)
      return
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!authorizeAdminRequest(req, res)) return
      await handleAdminApiRequest(req, res, url)
      return
    }

    if (url.pathname.startsWith('/admin/')) {
      if (!authorizeAdminRequest(req, res)) return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method not allowed')
      return
    }

    if (url.pathname.startsWith('/assets/tutorials/')) {
      const servedTutorialAsset = await serveStaticFile(
        req,
        res,
        publicRoot,
        decodeURIComponent(url.pathname),
        'no-cache',
      )
      if (servedTutorialAsset) return
    }

    const servedDistAsset = await serveStaticFile(
      req,
      res,
      distRoot,
      decodeURIComponent(url.pathname),
      'public, max-age=31536000, immutable',
    )
    if (servedDistAsset) return

    if (path.extname(url.pathname)) {
      sendError(res, 404, 'File not found')
      return
    }

    await serveFile(req, res, indexPath, 'text/html; charset=utf-8', 'no-cache')
  } catch (error) {
    console.error(error)
    if (!res.headersSent) {
      sendError(res, 500, 'Unexpected server error')
    } else {
      res.end()
    }
  }
})

server.listen(port, host, () => {
  console.log(`SceneMax website server listening on http://${host}:${port}`)
  if (!hasAdminAuth) {
    console.warn('ADMIN_USERNAME and ADMIN_PASSWORD are not set; admin routes are unprotected.')
  }
})

async function serveStaticFile(req, res, root, rawPathname, cacheControl) {
  const pathname = rawPathname === '/' ? '/index.html' : rawPathname
  const targetPath = path.join(root, pathname)

  if (!isInside(root, targetPath)) {
    sendError(res, 403, 'Forbidden')
    return true
  }

  try {
    const stat = await fs.stat(targetPath)
    if (!stat.isFile()) return false

    await serveFile(req, res, targetPath, getMimeType(targetPath), cacheControl)
    return true
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

async function serveFile(req, res, filePath, contentType, cacheControl) {
  const body = req.method === 'HEAD' ? undefined : await fs.readFile(filePath)

  res.statusCode = 200
  res.setHeader('content-type', contentType)
  res.setHeader('cache-control', cacheControl)
  if (body) {
    res.setHeader('content-length', body.length)
  }
  res.end(body)
}

function authorizeAdminRequest(req, res) {
  if (!hasAdminAuth) return true

  const header = req.headers.authorization ?? ''
  const [scheme, credentials] = header.split(' ')

  if (scheme === 'Basic' && credentials) {
    const decoded = Buffer.from(credentials, 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')
    const username = decoded.slice(0, separatorIndex)
    const password = decoded.slice(separatorIndex + 1)

    if (timingSafeEqual(username, adminUsername) && timingSafeEqual(password, adminPassword)) {
      return true
    }
  }

  res.statusCode = 401
  res.setHeader('www-authenticate', 'Basic realm="SceneMax Admin", charset="UTF-8"')
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('Authentication required')
  return false
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function getMimeType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

function isInside(root, target) {
  const relative = path.relative(root, target)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}
