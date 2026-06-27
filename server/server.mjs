import http from 'http'
import { spawn } from 'child_process'
import { readFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { join, resolve, extname } from 'path'
import { tmpdir } from 'os'
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
  '.html':        'text/html; charset=utf-8',
  '.js':          'application/javascript',
  '.css':         'text/css',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.png':         'image/png',
  '.webmanifest': 'application/manifest+json',
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
    const tmpDir = mkdtempSync(join(tmpdir(), 'rd-'))

    const cookiesFile = join(DATA_DIR, 'cookies.txt')
    const ytdlp = spawn('yt-dlp', [
      '--no-playlist',
      // H.264 + AAC: compatible con QuickTime/iOS sin re-encodear
      '-f', 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/best',
      '--merge-output-format', 'mp4',
      // faststart: mueve el moov atom al inicio para que QuickTime pueda abrirlo
      '--postprocessor-args', 'ffmpeg:-c:v copy -c:a copy -movflags +faststart',
      '--quiet',
      '--no-warnings',
      ...(existsSync(cookiesFile) ? ['--cookies', cookiesFile] : []),
      '-o', join(tmpDir, '%(title)s.%(ext)s'),
      igUrl,
    ])

    req.on('close', () => {
      cancelled = true
      ytdlp.kill()
    })

    ytdlp.stderr.on('data', chunk => process.stderr.write(`[yt-dlp] ${chunk}`))

    ytdlp.on('error', () => {
      rmSync(tmpDir, { recursive: true, force: true })
      if (!cancelled) json(res, 500, { error: 'yt-dlp no está instalado en el servidor.' })
    })

    ytdlp.on('close', code => {
      const duration = Date.now() - start

      let files = []
      try { files = readdirSync(tmpDir) } catch {}

      let video = null
      if (files[0]) {
        try { video = readFileSync(join(tmpDir, files[0])) } catch {}
      }
      rmSync(tmpDir, { recursive: true, force: true })

      if (cancelled) return

      if (code !== 0 || !video) {
        insert.run(igUrl, Date.now(), 0, 0, duration)
        return json(res, 502, { error: '¿Es el reel público? Instagram no dejó descargar el video.' })
      }

      // Use yt-dlp's sanitized filename (without extension) as the download name
      const rawName = files[0].replace(/\.[^.]+$/, '')
      const encodedName = encodeURIComponent(rawName + '.mp4')

      insert.run(igUrl, Date.now(), 1, video.length, duration)
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="reel.mp4"; filename*=UTF-8''${encodedName}`,
        'Content-Length': video.length,
      })
      res.end(video)
    })
    return
  }

  // GET /api/stats
  if (req.method === 'GET' && pathname === '/api/stats') {
    return json(res, 200, { ...statsTotal.get(), recent: statsRecent.all() })
  }

  // /stats → stats.html
  if (req.method === 'GET' && pathname === '/stats') {
    return serveStatic('/stats.html', res)
  }

  // Static files (production)
  serveStatic(pathname, res)
})

server.listen(PORT, () => console.log(`reeldown ➜ http://localhost:${PORT}`))
