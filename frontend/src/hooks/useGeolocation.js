import { useCallback, useEffect, useState } from 'react'

/**
 * Browser Geolocation, used only to stamp a lot with an approximate
 * collection point. If permission is denied or unavailable the caller falls
 * back to the collector's registered area — the flow never blocks on it.
 */
export function useGeolocation({ auto = true } = {}) {
  const [coords, setCoords] = useState(null)
  const [state, setState] = useState('idle') // idle | asking | granted | denied
  const [error, setError] = useState('')

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState('denied')
      setError('This device has no location support.')
      return
    }
    setState('asking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          accuracy: Math.round(pos.coords.accuracy),
        })
        setState('granted')
      },
      (err) => {
        setState('denied')
        setError(err.message)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  }, [])

  useEffect(() => { if (auto) request() }, [auto, request])

  return { coords, state, error, request }
}
