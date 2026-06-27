import { APP_VERSION } from './version.js'

document.getElementById('version').textContent = `v${APP_VERSION}`

const input         = document.getElementById('url-input')
const btn           = document.getElementById('btn-download')
const status        = document.getElementById('status')
const btnInstall    = document.getElementById('btn-install')
const guide         = document.getElementById('install-guide')
const btnDismiss    = document.getElementById('btn-dismiss-guide')
const tip           = document.getElementById('install-tip')
const tipText       = document.getElementById('install-tip-text')
const btnCloseTip   = document.getElementById('btn-close-tip')
const panelInput    = document.getElementById('panel-input')
const panelCarousel = document.getElementById('panel-carousel')
const carouselGrid  = document.getElementById('carousel-grid')
const carouselLabel = document.getElementById('carousel-label')
const btnBack       = document.getElementById('btn-carousel-back')
const btnDownAll    = document.getElementById('btn-download-all')

const INSTAGRAM_RE = /^https?:\/\/(www\.)?instagram\.com\//
const CAROUSEL_RE  = /instagram\.com\/(p|tv)\//

let carouselInfo     = null   // { url, count, entries }
let downloadingAll   = false

// ── Share Target ─────────────────────────────────────────────────────────────

if (location.pathname === '/share') {
  const p = new URLSearchParams(location.search)
  const combined = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ')
  const match = combined.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"]+/)
  if (match) {
    const igUrl = match[0]
    input.value = igUrl
    onInput()
    history.replaceState(null, '', '/')
    if (CAROUSEL_RE.test(igUrl)) {
      loadCarousel(igUrl, true)        // true = auto-download all
    } else {
      downloadSingle(igUrl)
    }
  }
}

// ── Install Prompt ────────────────────────────────────────────────────────────

const isAndroid    = /android/i.test(navigator.userAgent)
const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                     (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const isSafari     = /safari/i.test(navigator.userAgent) &&
                     !/chrome|crios|fxios|android/i.test(navigator.userAgent)
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
  tip.hidden = true
  installPrompt = null
})

btnInstall.addEventListener('click', async () => {
  if (isSafari) {
    tipText.innerHTML = isIOS
      ? 'Toca <strong>Compartir ↑</strong> en Safari y elige <strong>Añadir a inicio</strong>'
      : 'En Safari ve a <strong>Archivo → Añadir al Dock</strong>'
    tip.hidden = false
    return
  }
  if (!installPrompt) return
  installPrompt.prompt()
  const { outcome } = await installPrompt.userChoice
  if (outcome === 'accepted') {
    installPrompt = null
    btnInstall.hidden = true
    guide.hidden = true
  }
})

btnCloseTip.addEventListener('click', () => { tip.hidden = true })

btnDismiss.addEventListener('click', () => {
  guide.hidden = true
  localStorage.setItem('rd-guide-dismissed', '1')
})

// ── URL Input ─────────────────────────────────────────────────────────────────

input.addEventListener('input', onInput)
input.addEventListener('paste', () => setTimeout(onInput, 0))
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btn.disabled) handleDownload()
})
btn.addEventListener('click', handleDownload)

function onInput() {
  btn.disabled = !INSTAGRAM_RE.test(input.value.trim())
  clearStatus()
}

function handleDownload() {
  const url = input.value.trim()
  if (!INSTAGRAM_RE.test(url)) return
  if (CAROUSEL_RE.test(url)) {
    loadCarousel(url, false)
  } else {
    downloadSingle(url)
  }
}

// ── Single video download ─────────────────────────────────────────────────────

async function downloadSingle(url) {
  setLoading(true)
  showStatus('Descargando de Instagram…')
  try {
    await fetchAndSave(url, 1, pct => { if (pct > 0) showStatus(`Recibiendo… ${pct}%`) })
    input.value = ''
    btn.disabled = true
    showStatus('Listo', 'success')
  } catch (err) {
    showStatus(err.message, 'error')
  } finally {
    setLoading(false)
  }
}

// ── Carousel ──────────────────────────────────────────────────────────────────

async function loadCarousel(url, autoDownloadAll) {
  setLoading(true)
  showStatus('Analizando post…')
  try {
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`)
    if (!res.ok) throw new Error((await res.json()).error || 'Error analizando el post.')
    const data = await res.json()

    if (data.count <= 1) {
      // Post de un solo vídeo pese a la URL /p/
      clearStatus()
      setLoading(false)
      await downloadSingle(url)
      return
    }

    carouselInfo = { url, ...data }
    setLoading(false)
    clearStatus()
    showCarousel()

    if (autoDownloadAll) runDownloadAll()
  } catch (err) {
    showStatus(err.message, 'error')
    setLoading(false)
  }
}

function showCarousel() {
  carouselLabel.textContent = `${carouselInfo.count} vídeos`
  carouselGrid.innerHTML = ''
  carouselInfo.entries.forEach(entry => {
    carouselGrid.appendChild(buildThumbCard(entry))
  })
  panelInput.hidden = true
  panelCarousel.hidden = false
}

function buildThumbCard(entry) {
  const btn = document.createElement('button')
  btn.className = 'thumb-card'
  btn.dataset.index = entry.index

  if (entry.thumbnail) {
    const img = document.createElement('img')
    img.src = entry.thumbnail
    img.alt = entry.title
    img.className = 'thumb-img'
    btn.appendChild(img)
  }

  const overlay = document.createElement('div')
  overlay.className = 'thumb-overlay'
  overlay.innerHTML = `
    <svg class="thumb-icon-dl" width="22" height="22" viewBox="0 0 22 22" fill="none">
      <line x1="11" y1="3" x2="11" y2="15" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <polyline points="5,10 11,16 17,10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <line x1="4" y1="19" x2="18" y2="19" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <div class="thumb-spinner"></div>
    <svg class="thumb-icon-ok" width="22" height="22" viewBox="0 0 22 22" fill="none">
      <polyline points="4,11 9,16 18,6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`
  btn.appendChild(overlay)

  btn.addEventListener('click', () => {
    if (!downloadingAll) downloadThumb(entry.index, btn)
  })
  return btn
}

async function downloadThumb(index, card) {
  if (card.dataset.state === 'loading' || card.dataset.state === 'done') return
  setThumbState(card, 'loading')
  try {
    await fetchAndSave(carouselInfo.url, index, pct => {
      if (pct > 0) showStatus(`Recibiendo… ${pct}%`)
    })
    setThumbState(card, 'done')
    clearStatus()
  } catch (err) {
    setThumbState(card, 'error')
    showStatus(err.message, 'error')
  }
}

async function runDownloadAll() {
  if (downloadingAll) return
  downloadingAll = true
  btnDownAll.disabled = true
  btnDownAll.classList.add('loading')
  btnBack.disabled = true

  try {
    for (const entry of carouselInfo.entries) {
      const card = carouselGrid.querySelector(`[data-index="${entry.index}"]`)
      if (card?.dataset.state === 'done') continue
      showStatus(`Descargando ${entry.index} de ${carouselInfo.count}…`)
      setThumbState(card, 'loading')
      try {
        await fetchAndSave(carouselInfo.url, entry.index, pct => {
          if (pct > 0) showStatus(`Vídeo ${entry.index}/${carouselInfo.count}: ${pct}%`)
        })
        setThumbState(card, 'done')
      } catch {
        setThumbState(card, 'error')
      }
    }
    showStatus('Listo', 'success')
  } finally {
    downloadingAll = false
    btnDownAll.disabled = false
    btnDownAll.classList.remove('loading')
    btnBack.disabled = false
  }
}

btnBack.addEventListener('click', () => {
  panelCarousel.hidden = true
  panelInput.hidden = false
  carouselGrid.innerHTML = ''
  carouselInfo = null
  clearStatus()
})

btnDownAll.addEventListener('click', () => runDownloadAll())

function setThumbState(card, state) {
  if (card) card.dataset.state = state
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchAndSave(url, index, onProgress) {
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, index }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'No se pudo descargar el vídeo.')
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
    if (total > 0) onProgress(Math.round(received / total * 100))
  }

  const blob = new Blob(chunks, { type: 'video/mp4' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
