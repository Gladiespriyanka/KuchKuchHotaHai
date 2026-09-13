import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { useI18n } from '../i18n'

const REGION_ID = 'kc-qr-region'

/**
 * Camera QR scanner (html5-qrcode) with a typed-ID fallback, because demo
 * laptops and sandboxed iframes often have no camera permission.
 */
export default function Scanner({ onResult }) {
  const { t } = useI18n()
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const scannerRef = useRef(null)

  useEffect(() => () => stop(), [])

  async function stop() {
    try {
      await scannerRef.current?.stop()
      scannerRef.current?.clear()
    } catch { /* already stopped */ }
    scannerRef.current = null
  }

  async function start() {
    setError('')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(REGION_ID)
      scannerRef.current = scanner
      setActive(true)
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decoded) => {
          const id = extractLotId(decoded)
          if (id) {
            stop().then(() => {
              setActive(false)
              onResult(id)
            })
          }
        },
        () => {}
      )
    } catch (err) {
      setActive(false)
      setError(err?.message || t('cameraBlocked'))
    }
  }

  return (
    <div className="plate-lg p-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg">{t('scanLotQr')}</span>
        {active ? (
          <button type="button" className="btn-ghost ml-auto" onClick={() => { stop(); setActive(false) }}>
            <CameraOff size={16} /> Stop
          </button>
        ) : (
          <button type="button" className="btn-primary ml-auto py-2" onClick={start}>
            <Camera size={16} /> {t('takePhoto')}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate2">{t('scanHelp')}</p>

      <div className="relative mt-3 overflow-hidden border-2 border-ink bg-boardDark">
        <div id={REGION_ID} className="min-h-[220px] w-full" />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center text-white/40">
            <Camera size={44} strokeWidth={1.5} />
          </div>
        )}
        {active && <div className="scan-sweep pointer-events-none absolute inset-x-0 h-1 bg-brass/80" />}
      </div>

      {error && <p className="mt-2 text-sm text-copper">{t('cameraBlocked')}</p>}

      <div className="mt-4 border-t-2 border-dashed border-ink/20 pt-3">
        <label className="eyebrow" htmlFor="manual-lot">{t('enterLotManually')}</label>
        <div className="mt-1 flex gap-2">
          <input
            id="manual-lot"
            className="field num flex-1 uppercase"
            placeholder="KC-2026-000127"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            type="button"
            className="btn-brass"
            disabled={!manual.trim()}
            onClick={() => onResult(manual.trim().toUpperCase())}
          >
            {t('open')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function extractLotId(text) {
  const match = String(text).match(/KC-\d{4}-\d{6}/i)
  return match ? match[0].toUpperCase() : null
}
