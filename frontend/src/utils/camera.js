/**
 * Which camera mechanism to use for "Take Photo".
 *
 * Preference order, per the problem statement and because it is what works
 * best on entry-level Android:
 *
 *   1. Native capture — <input type="file" accept="image/*" capture="environment">.
 *      Hands off to the phone's own camera app. No library, no getUserMedia
 *      permission dance, no live-stream battery cost, and it works on old
 *      WebViews and over plain http on a LAN IP.
 *   2. In-app preview (getUserMedia) — only where native capture would just
 *      open a file dialog, i.e. desktop browsers with no camera intent.
 *
 * Both paths hand back the same JPEG data URL and feed the same pipeline.
 */
export function supportsNativeCapture() {
  if (typeof document === 'undefined') return false
  // A phone-like device: the capture attribute will hand off to the camera
  // app. On a device with no camera the attribute is simply ignored and the
  // browser shows a file picker, which is a safe outcome.
  const coarse = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)')?.matches
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return Boolean(coarse || touch)
}

/**
 * Which mechanism should "Take Photo" use?
 *
 *   'live'   — in-app getUserMedia preview with a shutter button.
 *   'native' — hand off to the device camera app via <input capture>.
 *
 * Live wins whenever it is actually usable, because it is the only option
 * that visibly opens a camera on a laptop. The previous rule keyed off touch
 * support alone, so a touchscreen Windows laptop took the native path and
 * "Take Photo" just opened the same file dialog as "Choose from gallery" —
 * which is exactly the bug this fixes.
 *
 * getUserMedia needs a secure context (https, or localhost). Over a LAN IP on
 * plain http it is unavailable, so a phone there correctly falls back to the
 * native camera app, which still works.
 */
export function preferredCameraMode() {
  const secure = typeof window === 'undefined' || window.isSecureContext !== false
  if (supportsLiveCamera() && secure) return 'live'
  if (supportsNativeCapture()) return 'native'
  // No live camera and not a phone: still offer the native input — on
  // Windows the file dialog can reach a connected webcam.
  return 'native'
}

export function supportsLiveCamera() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Read a File into a downscaled JPEG data URL. Shared by both paths. */
export function fileToDataUrl(file, { maxSize = 640, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the photo'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(reader.result)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          // Downscaling is an optimisation, never a blocker.
          resolve(reader.result)
        }
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
