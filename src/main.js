const input = document.getElementById('url-input')
const btn = document.getElementById('btn-download')
const status = document.getElementById('status')

const INSTAGRAM_RE = /^https?:\/\/(www\.)?instagram\.com\//

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
  clearStatus()

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

    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'reel.mp4'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)

    showStatus('Listo, revisa tus descargas', 'success')
  } catch (err) {
    showStatus(err.message, 'error')
  } finally {
    setLoading(false)
  }
}

function setLoading(on) {
  btn.disabled = on
  btn.classList.toggle('loading', on)
}

function showStatus(msg, type) {
  status.textContent = msg
  status.className = `status ${type}`
}

function clearStatus() {
  status.textContent = ''
  status.className = 'status'
}
