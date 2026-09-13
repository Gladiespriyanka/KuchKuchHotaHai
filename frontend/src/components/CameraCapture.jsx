import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, X } from 'lucide-react'
import { useI18n } from '../i18n'

/**
 * In-app camera preview — the DESKTOP path only.
 *
 * On phones "Take Photo" uses the native camera intent
 * (<input capture="environment">), which is lighter and more reliable on
 * entry-level Android. Desktop browsers expose `capture` but silently show a
 * file dialog instead of a camera, so there we open a getUserMedia preview
 * with a shutter button. See utils/camera.js for the decision.
 *
 * Either way the captured frame is downscaled to the same JPEG data URL, and
 * handed to the same classification pipeline.
 */
export default function CameraCapture({ onCapture, onCancel, onUnavailable, maxSize = 640, quality = 0.72 }) {
  const { t } = useI18n()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | live | error
  const [error, setError] = useState('')
  const [facing, setFacing] = useState('environment')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async (mode) => {
    stop()
    setStatus('starting')
    setError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = window.isSecureContext === false ? t('cameraInsecure') : t('cameraUnsupported')
      setStatus('error')
      setError(message)
      onUnavailable?.(message)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // iOS Safari needs an explicit play() after the stream is attached.
        await videoRef.current.play().catch(() => {})
      }
      setStatus('live')
    } catch (err) {
      const message =
        err?.name === 'NotAllowedError' ? t('cameraDenied')
          : err?.name === 'NotFoundError' ? t('cameraNone')
            : t('cameraUnsupported')
      setStatus('error')
      setError(message)
      onUnavailable?.(message)
    }
  }, [stop, t, onUnavailable])

  useEffect(() => {
    start(facing)
    return stop
  }, [facing, start, stop])

  // Release the camera if the tab is hidden — a live stream left running
  // drains a collector's battery.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [stop])

  function shoot() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (facing === 'user') {
      // Un-mirror the selfie camera so the saved photo matches reality.
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    stop()
    onCapture(dataUrl)
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden border-2 border-ink bg-boardDark">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-64 w-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        {status !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white/80">
            <Camera size={40} strokeWidth={1.5} />
            <span className="text-sm">{status === 'starting' ? t('cameraStarting') : error}</span>
          </div>
        )}
        {status === 'live' && (
          <span className="pointer-events-none absolute inset-4 border-2 border-brass/70" />
        )}
      </div>

      {status === 'error' && <p className="text-sm text-copper">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1 justify-center text-lg"
          disabled={status !== 'live'}
          onClick={shoot}
        >
          <Camera size={22} /> {t('capture')}
        </button>
        <button
          type="button"
          className="btn-ghost px-3"
          onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}
          aria-label={t('switchCamera')}
        >
          <RefreshCw size={18} />
        </button>
        <button type="button" className="btn-ghost px-3" onClick={() => { stop(); onCancel() }} aria-label={t('back')}>
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
