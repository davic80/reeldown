const fmt = {
  bytes(b) {
    if (!b) return '—'
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`
    if (b >= 1048576)    return `${(b / 1048576).toFixed(1)} MB`
    return `${(b / 1024).toFixed(0)} KB`
  },
  date(ts) {
    return new Date(ts).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  },
  reelId(url) {
    const m = url.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/)
    return m ? m[2] : url.slice(0, 20) + '…'
  },
}

async function load() {
  const data = await fetch('/api/stats').then(r => r.json())

  const total   = data.total   ?? 0
  const ok      = data.successful ?? 0
  const failed  = total - ok
  const bytes   = data.bytes_total ?? 0

  document.getElementById('t-total').textContent = total
  document.getElementById('t-ok').textContent    = ok
  document.getElementById('t-err').textContent   = failed
  document.getElementById('t-bytes').textContent = fmt.bytes(bytes)

  const tbody = document.getElementById('tbody')
  if (!data.recent?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Sin descargas aún</td></tr>'
    return
  }

  tbody.innerHTML = data.recent.map(r => {
    const id   = fmt.reelId(r.url)
    const date = fmt.date(r.timestamp)
    const size = fmt.bytes(r.bytes)
    const badge = r.success
      ? '<span class="badge ok">OK</span>'
      : '<span class="badge err">Error</span>'
    return `
      <tr>
        <td><a class="reel-link" href="${r.url}" target="_blank" rel="noopener">${id}</a></td>
        <td style="color:var(--muted)">${date}</td>
        <td>${size}</td>
        <td>${badge}</td>
      </tr>`
  }).join('')
}

load()
