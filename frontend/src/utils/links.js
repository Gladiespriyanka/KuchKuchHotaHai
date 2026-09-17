/**
 * The app uses hash routing so the same build works from a web server, from
 * a phone home screen and straight off the file system. The QR therefore
 * carries <origin>/#/verify/<lot id> — still just an identifier, never the
 * lot contents.
 */
export function verifyUrl(lotId) {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/verify/${lotId}`
}
