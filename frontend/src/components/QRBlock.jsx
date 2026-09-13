import QRCode from 'react-qr-code'
import { useI18n } from '../i18n'
import { verifyUrl } from '../utils/links'

/**
 * The QR carries only the verification path (/verify/<lot id>) — never the
 * lot contents. The recycler's app resolves it against the backend so the
 * details are always the current ones.
 */
export default function QRBlock({ lotId, size = 200 }) {
  const { t } = useI18n()
  const payload = verifyUrl(lotId)
  return (
    <div className="plate-lg p-4 text-center">
      <div className="eyebrow">{t('showQr')}</div>
      <div className="mt-3 flex justify-center">
        <div className="border-2 border-ink bg-white p-3">
          <QRCode value={payload} size={size} fgColor="#12211C" bgColor="#FFFFFF" level="M" />
        </div>
      </div>
      <div className="num mt-3 text-xl font-bold tracking-wide">{lotId}</div>
      <p className="mt-2 text-xs text-slate2">{t('qrNote')}</p>
      <p className="num mt-1 break-all text-[10px] text-slate2/70">/verify/{lotId}</p>
    </div>
  )
}
