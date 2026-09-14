import { useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, IndianRupee, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'
import { LanguageSwitcher } from '../components/Shell'
import { DesktopDecor } from '../components/DesktopDecor'
import { AuthGrid, AuthHeader, AuthSideDecor } from '../components/AuthLayout'

/**
 * Landing page — the first thing anyone sees, before the login form.
 *
 * Deliberately does three things and stops: says what the app is for in one
 * line, lets the visitor pick their language before reading anything else,
 * and gets them to the login. No marketing filler, because the audience is a
 * collector standing in a scrapyard, not a desktop browser.
 */
export default function Welcome() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const points = [
    { icon: IndianRupee, key: 'welcomePointPrice' },
    { icon: BadgeCheck, key: 'welcomePointAuthorised' },
    { icon: ShieldCheck, key: 'welcomePointRecord' },
  ]

  return (
    <div className="relative min-h-dvh overflow-hidden bg-mint paper-grid lg:flex lg:flex-col">
      <DesktopDecor />
      <AuthHeader />

      <AuthGrid>
        {/* Mobile-only header row: desktop uses AuthHeader instead. */}
        <div className="flex items-center justify-between lg:hidden">
          <span className="font-display text-xl tracking-wide">{t('appName')}</span>
          <LanguageSwitcher />
        </div>

        {/* Left column (desktop only): editorial sustainability message. */}
        <div className="hidden lg:block">
          <p className="eyebrow text-slate2">{t('welcomeEyebrow')}</p>
          <h1 className="mt-3 font-display text-[2.3rem] leading-[1.4] text-ink">
            {t('welcomeHeadline1')}
            <br />
            <span className="bg-brass px-2 py-0.5">{t('welcomeHeadline2')}</span>
          </h1>
          <div className="mt-5 h-1.5 w-24 bg-copper" />
          <p className="mt-6 max-w-xs text-base leading-relaxed text-slate2">{t('welcomeSub')}</p>
        </div>

        {/* Mobile-only hero card. */}
        <div className="mt-8 border-[3px] border-ink bg-boardDark p-6 shadow-plate lg:hidden">
          <p className="font-display text-4xl leading-[1.1] text-white">
            {t('welcomeHeadline1')}
            <br />
            <span className="bg-brass px-2 text-ink">{t('welcomeHeadline2')}</span>
          </p>
          <p className="mt-4 text-sm leading-snug text-white/75">{t('welcomeSub')}</p>
        </div>

        {/* Center column: feature points + CTA. Single column on mobile. */}
        <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:flex-none">
          <ul className="mt-5 space-y-2 lg:mt-0 lg:space-y-3">
            {points.map(({ icon: Icon, key }) => (
              <li key={key} className="plate flex items-center gap-3 p-3 lg:p-5">
                <span className="border-2 border-ink bg-brass p-1.5 lg:p-2">
                  <Icon size={18} strokeWidth={2.5} className="lg:h-6 lg:w-6" />
                </span>
                <span className="text-sm font-semibold leading-snug lg:text-lg">{t(key)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-6 lg:mt-8 lg:pt-0">
            <button className="btn-primary w-full py-4 text-lg lg:h-14 lg:text-xl" onClick={() => navigate('/login')}>
              {t('welcomeCta')} <ArrowRight size={20} strokeWidth={2.5} />
            </button>
            <p className="mt-3 text-center text-[11px] text-slate2">{t('welcomeNote')}</p>
          </div>
        </div>

        {/* Right column (desktop only): environmental decoration. */}
        <AuthSideDecor words={['Reduce Reuse', 'Recycle Repeat']} />
      </AuthGrid>
    </div>
  )
}
