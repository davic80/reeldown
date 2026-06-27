import { APP_VERSION } from './version.js'

document.getElementById('version').textContent = `v${APP_VERSION}`

const input      = document.getElementById('url-input')
const btn        = document.getElementById('btn-download')
const status     = document.getElementById('status')
const btnInstall = document.getElementById('btn-install')
const guide      = document.getElementById('install-guide')
const btnDismiss = document.getElementById('btn-dismiss-guide')

const INSTAGRAM_RE = /^https?:\/\/(www\.)?instagram\.com\//

// ── Share Target ─────────────────────────────────────────────────────────────
// Android opens /share?url=...&text=... when user taps Share → ReelDown

if (location.pathname === '/share') {
  const p = new URLSearchParams(location.search)
  const combined = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ')
  const match = combined.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"]+/)
  if (match) {
    input.value = match[0]
    onInput()
    history.replaceState(null, '', '/')
    downloadVideo()
  }
}

// ── Install Prompt ────────────────────────────────────────────────────────────

const isAndroid    = /android/i.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
let installPrompt  = null

if (!isStandalone) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e
    btnInstall.hidden = false
    if (isAndroid && !localStorage.getItem('rd-guide-dismissed')) {
      guide.hidden = false
    }
  })
}

window.addEventListener('appinstalled', () => {
  btnInstall.hidden = true
  guide.hidden = true
  installPrompt = null
})

btnInstall.addEventListener('click', async () => {
  if (!installPrompt) return
  installPrompt.prompt()
  const { outcome } = await installPrompt.userChoice
  if (outcome === 'accepted') {
    installPrompt = null
    btnInstall.hidden = true
    guide.hidden = true
  }
})

btnDismiss.addEventListener('click', () => {
  guide.hidden = true
  localStorage.setItem('rd-guide-dismissed', '1')
})

// ── Download ──────────────────────────────────────────────────────────────────

input.addEventListener('input', onInput)
input.addEventListener('paste', () => setTimeout(onInput, 0))
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btn.disabled) downloadVideo()
})
btn.addEventListener('click', downloadVideo)

function onInput() {
  btn.disabled = !INSTAGRAM_RE.test(input.value.trim())
  clearStatus()
}

async function downloadVideo() {
  const url = input.value.trim()
  if (!INSTAGRAM_RE.test(url)) return

  setLoading(true)
  showStatus('Descargando de Instagram…')

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'No se pudo descargar el video.')
    }

    const total    = Number(res.headers.get('Content-Length')) || 0
    const filename = parseFilename(res.headers.get('Content-Disposition') || '')
    const reader   = res.body.getReader()
    const chunks   = []
    let received   = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) showStatus(`Recibiendo… ${Math.round(received / total * 100)}%`)
    }

    const blob = new Blob(chunks, { type: 'video/mp4' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)

    input.value = ''
    btn.disabled = true
    showStatus('Listo', 'success')
  } catch (err) {
    showStatus(err.message, 'error')
  } finally {
    setLoading(false)
  }
}

function parseFilename(cd) {
  const star  = cd.match(/filename\*=UTF-8''([^;\s]+)/i)
  if (star) return decodeURIComponent(star[1])
  const plain = cd.match(/filename="([^"]+)"/)
  return plain ? plain[1] : 'reel.mp4'
}

function setLoading(on) {
  btn.disabled = on
  btn.classList.toggle('loading', on)
}

function showStatus(msg, type = '') {
  status.textContent = msg
  status.className = `status ${type}`.trim()
}

function clearStatus() {
  status.textContent = ''
  status.className = 'status'
}
