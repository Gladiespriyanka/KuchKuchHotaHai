import { Recycle } from 'lucide-react'
import { useI18n } from '../i18n'
import { LanguageSwitcher } from './Shell'

/**
 * Full-width dark header for the desktop (lg+) auth screens. Deliberately
 * outside the centered grid below it — the header spans the whole browser
 * width, not just the content column.
 */
export function AuthHeader() {
  const { t } = useI18n()
  return (
    <div className="hidden items-center justify-between bg-boardDark px-10 py-5 lg:flex xl:px-12">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl tracking-wide text-brass">{t('appName')}</span>
        <span className="text-sm text-white/70">{t('tagline')}</span>
      </div>
      <LanguageSwitcher dark />
    </div>
  )
}

/**
 * Right-column environmental decoration: a recycle mark and a stacked
 * word pair, low-contrast so it never competes with the form. Rendered as
 * a real grid cell (not an absolute overlay), so it occupies real space.
 */
export function AuthSideDecor({ words }) {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-8 text-board/25 lg:flex">
      <Recycle size={92} strokeWidth={1.5} />
      <div className="flex flex-col items-center gap-1 text-center">
        {words.map((line) => (
          <span
            key={line}
            className="font-display text-xl uppercase leading-tight tracking-[0.15em]"
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Three-column desktop grid, 28/52/20 — editorial column, application
 * column, decorative column — using fr tracks so the ratio holds at any
 * viewport width (gaps are subtracted before the fr split, unlike raw
 * percentage tracks). Below `lg` this renders as a plain block — callers
 * keep their existing mobile-first markup untouched via their own
 * `lg:hidden` / `hidden lg:block` toggles on the children they pass in.
 */
export function AuthGrid({ children }) {
  return (
    <div className="lg:flex lg:flex-1 lg:items-center">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 lg:max-w-[1700px] lg:flex-none lg:grid lg:grid-cols-[28fr_52fr_20fr] lg:items-center lg:gap-6 lg:px-8 lg:py-8 xl:gap-10 xl:px-16">
        {children}
      </div>
    </div>
  )
}
