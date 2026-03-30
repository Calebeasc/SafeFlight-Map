import { useState } from 'react'
import { useSovereign } from '../context/SovereignContext'

const DEV_DOWNLOAD_API_BASE_KEY = 'sfm_dev_download_api_base_v1'
const DEV_DOWNLOAD_API_CANDIDATES = [
  'http://127.0.0.1:8742',
  'http://localhost:8742',
  'http://127.0.0.1:8000',
  'http://localhost:8000',
]

function buildApiUrl(path, base = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

async function probeApiBase(base) {
  const response = await fetch(buildApiUrl('/health', base), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
  })
  return response.ok
}

async function resolveApiBase() {
  if (window.location.protocol !== 'file:') return ''

  const candidates = []
  const storedBase = window.localStorage.getItem(DEV_DOWNLOAD_API_BASE_KEY) || ''

  ;[storedBase].concat(DEV_DOWNLOAD_API_CANDIDATES).forEach((candidate) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
  })

  for (const candidate of candidates) {
    try {
      const ok = await probeApiBase(candidate)
      if (ok) {
        window.localStorage.setItem(DEV_DOWNLOAD_API_BASE_KEY, candidate)
        return candidate
      }
    } catch {}
  }

  throw new Error(
    'Local backend not reachable. Start Invincible and open the dev console through http://127.0.0.1:8742/#dev.',
  )
}

function startDownload(url, transport = 'location') {
  const finalUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
  if (transport === 'iframe') transport = 'location'
  window.location.href = finalUrl
}

function inferFilename(response) {
  const disposition = response.headers.get('content-disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i)
  if (plainMatch?.[1]) return plainMatch[1]
  return 'Invincible_Inc_Sovereign_Dev_v2.exe'
}

function saveBlob(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl)
  }, 1000)
}

export default function useDevBuildDownload() {
  const { authHeaders, isDeveloper } = useSovereign()
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const triggerDownload = async ({ transport = 'location', resetDelayMs = 4000 } = {}) => {
    if (!isDeveloper || phase === 'authorizing' || phase === 'downloading') return false

    setError('')
    setToast('')
    setPhase('authorizing')

    try {
      const apiBase = await resolveApiBase()
      const response = await fetch(buildApiUrl('/api/dist/secure-dev-build', apiBase), {
        method: 'GET',
        headers: authHeaders,
        cache: 'no-store',
        credentials: 'omit',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.detail || payload?.error || 'Developer build authorization failed.')
      }

      const filename = inferFilename(response)
      const blob = await response.blob()
      setPhase('downloading')
      setToast('Secure binary stream initialized.')
      if (transport === 'location') {
        saveBlob(blob, filename)
      } else {
        saveBlob(blob, filename)
      }
      window.setTimeout(() => {
        setPhase('idle')
      }, resetDelayMs)
      return true
    } catch (downloadError) {
      setPhase('idle')
      setError(downloadError?.message || 'Developer build download failed.')
      return false
    }
  }

  return {
    error,
    isBusy: phase === 'authorizing' || phase === 'downloading',
    isDeveloper,
    phase,
    toast,
    triggerDownload,
  }
}
