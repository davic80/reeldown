import http from 'http'
import { spawn } from 'child_process'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve, extname } from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT) || 3000
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../.data')
const DIST = resolve(__dirname, '../dist')

// -- DB setup ---------------------------------------------------------------

mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(join(DATA_DIR, 'stats.db'))
db.exec(`PRAGMA journal_mode = WAL`)
db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL,
    success     INTEGER NOT NULL DEFAULT 0,
    bytes       INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0
  )
`)
const insert = db.prepare(
  'INSERT INTO downloads (url, timestamp, success, bytes, duration_ms) VALUES (?, ?, ?, ?, ?)'
)
const statsTotal = db.prepare(
  'SELECT COUNT(*) AS total, SUM(success) AS successful, SUM(bytes) AS bytes_total FROM downloads'
)
const statsRecent = db.prepare(
  'SELECT url, timestamp, success, bytes FROM downloads ORDER BY id DESC LIMIT 20'
)

// -- Helpers ----------------------------------------------------------------

function isInstagramUrl(raw) {
  try {
    const u = new URL(raw)
    return u.hostname === 'www.instagram.com' || u.hostname === 'instagram.com'
  } catch {
    return false
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1)
  const filePath = resolve(DIST, rel)

  // Prevent directory traversal
  if (!filePath.startsWith(DIST + '/') && filePath !== DIST) {
    res.writeHead(403); res.end('Forbidden'); return
  }

  const target = existsSync(filePath) ? filePath : resolve(DIST, 'index.html')
  try {
    const body = readFileSync(target)
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('Not found')
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > limit) reject(new Error('Payload too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// -- Server -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const { pathname } = url

  // POST /api/download
  if (req.method === 'POST' && pathname === '/api/download') {
    let igUrl
    try {
      const raw = await readBody(req)
      igUrl = JSON.parse(raw)?.url?.trim()
    } catch {
      return json(res, 400, { error: 'Petición inválida' })
    }

    if (!igUrl || !isInstagramUrl(igUrl)) {
      return json(res, 400, { error: 'URL de Instagram inválida' })
    }

    const start = Date.now()
    let cancelled = false

    const ytdlp = spawn('yt-dlp', [
      '--no-playlist',
      '--merge-output-format', 'mp4',
      '--quiet',
      '--no-warnings',
      '-o', '-',
      igUrl,
    ])

    req.on('close', () => {
      cancelled = true
      ytdlp.kill()
    })

    const chunks = []
    ytdlp.stdout.on('data', chunk => chunks.push(chunk))
    ytdlp.stderr.on('data', chunk => process.stderr.write(`[yt-dlp] ${chunk}`))

    ytdlp.on('close', code => {
      if (cancelled) return
      const duration = Date.now() - start
      if (code !== 0 || chunks.length === 0) {
        insert.run(igUrl, Date.now(), 0, 0, duration)
        return json(res, 502, { error: '¿Es el reel público? Instagram no dejó descargar el video.' })
      }
      const body = Buffer.concat(chunks)
      insert.run(igUrl, Date.now(), 1, body.length, duration)
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="reel.mp4"',
        'Content-Length': body.length,
      })
      res.end(body)
    })

    ytdlp.on('error', () => {
      if (!cancelled) json(res, 500, { error: 'yt-dlp no está instalado en el servidor.' })
    })
    return
  }

  // GET /api/stats
  if (req.method === 'GET' && pathname === '/api/stats') {
    return json(res, 200, { ...statsTotal.get(), recent: statsRecent.all() })
  }

  // Static files (production)
  serveStatic(pathname, res)
})

server.listen(PORT, () => console.log(`reeldown ➜ http://localhost:${PORT}`))
