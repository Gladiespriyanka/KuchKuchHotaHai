import { useI18n } from '../../i18n'
import { SpeakButton } from '../../components/ui'

const CARDS = [
  { icon: '🔥', title: 'safeCables', body: 'safeCablesBody', tone: 'bg-copper text-white' },
  { icon: '🔋', title: 'safeBattery', body: 'safeBatteryBody', tone: 'bg-brass' },
  { icon: '🧪', title: 'safeAcid', body: 'safeAcidBody', tone: 'bg-white' },
  { icon: '🖥️', title: 'safeCrt', body: 'safeCrtBody', tone: 'bg-white' },
]

export default function Safety() {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">{t('safetyTitle')}</h1>
          <p className="text-sm text-slate2">{t('safetyIntro')}</p>
        </div>
        <SpeakButton text={CARDS.map((c) => `${t(c.title)}. ${t(c.body)}`).join(' ')} />
      </div>

      {CARDS.map((card) => (
        <div key={card.title} className={`plate-lg p-4 ${card.tone}`}>
          <div className="flex items-start gap-3">
            <span className="text-4xl leading-none">{card.icon}</span>
            <div className="flex-1">
              <div className="font-display text-xl leading-tight">{t(card.title)}</div>
              <p className="mt-1 text-sm leading-snug">{t(card.body)}</p>
            </div>
            <SpeakButton text={`${t(card.title)}. ${t(card.body)}`} />
          </div>
        </div>
      ))}

      <p className="pb-2 text-center text-[11px] text-slate2">
        General handling guidance for a prototype. It does not replace training or protective equipment.
      </p>
    </div>
  )
}
