import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Cloud, CloudOff, LogOut, Plug, RefreshCw, Unplug } from 'lucide-react'
import { LANGUAGES, useI18n } from '../i18n'
import { DEMO_MODE, api, auth, probeBackend } from '../services/api'
import { useBackendStatus, useCurrentUser } from '../hooks/useCurrentUser'
import { pendingDrafts } from '../offline/db'
import { syncDrafts } from '../offline/sync'

/**
 * Back button shown on every screen except the role's home screen.
 * Uses browser history, so it always returns wherever the user came from.
 */
export function BackButton({ dark = false, homes = [] }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (homes.includes(pathname)) return null
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(homes[0] || '/'))}
      aria-label="Back"
      className={`btn px-2 py-1.5 ${dark ? 'border-white/40 bg-white/10 text-white' : 'border-ink bg-white'}`}
    >
      <ChevronLeft size={18} strokeWidth={2.5} />
    </button>
  )
}

export function LanguageSwitcher({ dark = false }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`inline-flex border-2 ${dark ? 'border-white/30' : 'border-ink'}`}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={`px-2.5 py-1 text-sm font-semibold transition-colors ${
            lang === l.code
              ? 'bg-brass text-ink'
              : dark
                ? 'text-white/75 hover:bg-white/10'
                : 'text-ink hover:bg-ink/5'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** Live online/offline pill plus the draft-sync trigger. */
export function ConnectionPill({ dark = false }) {
  const { t } = useI18n()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [drafts, setDrafts] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    const tick = setInterval(async () => setDrafts((await pendingDrafts()).length), 4000)
    pendingDrafts().then((d) => setDrafts(d.length))
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    if (online && drafts > 0 && !syncing) {
      setSyncing(true)
      syncDrafts()
        .then(async () => setDrafts((await pendingDrafts()).length))
        .catch(() => {})
        .finally(() => setTimeout(() => setSyncing(false), 900))
    }
  }, [online, drafts, syncing])

  const base = dark ? 'border-white/30 text-white' : 'border-ink text-ink'
  if (syncing)
    return (
      <span className={`chip ${base} bg-brass text-ink`}>
        <RefreshCw size={12} className="animate-spin" /> {t('syncing')}
      </span>
    )
  return (
    <span className={`chip ${base} ${online ? 'bg-board text-white' : 'bg-copper text-white'}`}>
      {online ? <Cloud size={12} /> : <CloudOff size={12} />}
      {online ? t('online') : t('offline')}
      {drafts > 0 && <span className="num ml-1">·{drafts}</span>}
    </span>
  )
}

/**
 * Real backend state.
 *
 * NOT rendered in the normal UI any more — the visible "Backend connected"
 * badge was removed on request. The component stays because the health
 * polling, the offline banner and the connection logic all depend on the same
 * state, and it is still useful on the admin screens for diagnosis.
 */
export function BackendPill({ dark = false }) {
  const { t } = useI18n()
  const connected = useBackendStatus()
  if (DEMO_MODE) {
    return <span className="chip border-ink/40 bg-brass text-ink">{t('demoModeOn')}</span>
  }
  if (connected === null) {
    return (
      <span className={`chip ${dark ? 'border-white/30 text-white/70' : 'border-ink text-slate2'}`}>…</span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => probeBackend()}
      title={`${api.base || 'no API URL'} · ${t('retry')}`}
      className={`chip ${connected ? 'bg-board text-white' : 'bg-copper text-white'} ${
        dark ? 'border-white/30' : 'border-ink'
      }`}
    >
      {connected ? <Plug size={12} /> : <Unplug size={12} />}
      {connected ? t('backendConnected') : t('backendDisconnected')}
    </button>
  )
}

/** Full-width warning shown while the API is unreachable in live mode. */
export function BackendBanner() {
  const { t } = useI18n()
  const connected = useBackendStatus()
  if (DEMO_MODE || connected !== false) return null
  return (
    <div className="border-b-2 border-ink bg-copper px-4 py-2 text-sm font-semibold text-white">
      🔴 {t('backendDisconnected')} — {t('backendDown')}{' '}
      <button type="button" className="underline" onClick={() => probeBackend()}>{t('retry')}</button>
    </div>
  )
}

/**
 * Vertical nav list for the collector's desktop sidebar. `items` is the
 * primary list; `secondary` (if given) renders below a divider — mirrors
 * the mobile bottom nav's items plus the pages it has no room for.
 */
export function SidebarNav({ items, secondary = [] }) {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
      isActive ? 'border-ink bg-brass text-ink' : 'border-transparent text-ink/80 hover:bg-ink/5'
    }`
  return (
    <nav className="flex h-full flex-col gap-4 p-3">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={linkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      {secondary.length > 0 && (
        <ul className="space-y-1 border-t-2 border-line pt-3">
          {secondary.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={linkClass}>
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

/**
 * Collector shell. Mobile/tablet (<lg): sticky header + bottom nav, as
 * before. Desktop (lg+): full-width header with brand, status and user
 * menu, plus a fixed left sidebar — the bottom nav and mobile header are
 * hidden rather than removed, so nothing about the mobile experience
 * changes.
 */
export function CollectorShell({ title, children, nav, sidebar }) {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { t } = useI18n()
  return (
    <div className="min-h-dvh bg-mint paper-grid pb-24 lg:flex lg:min-h-dvh lg:flex-col lg:pb-0">
      {/* Mobile/tablet sticky header. */}
      <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-board text-white lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2.5">
          <BackButton dark homes={['/app']} />
          <span className="font-display text-lg tracking-wide">{title}</span>
          <div className="ml-auto flex items-center gap-2">
            <ConnectionPill dark />
            <LanguageSwitcher dark />
          </div>
        </div>
        <BackendBanner />
      </header>

      {/* Desktop full-width header. */}
      <header className="hidden shrink-0 border-b-[3px] border-ink bg-board text-white lg:block">
        <div className="flex items-center gap-4 px-8 py-4 xl:px-10">
          <div>
            <div className="font-display text-2xl tracking-wide text-brass">{t('appName')}</div>
            <div className="text-xs text-white/70">{t('tagline')}</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ConnectionPill dark />
            <LanguageSwitcher dark />
            <div className="flex items-center gap-2 border-l border-white/20 pl-3">
              <span className="text-sm text-white/85">
                {t('greeting')}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
              </span>
              <button
                type="button"
                className="btn border-white/40 bg-white/10 px-2.5 py-1.5 text-xs text-white"
                onClick={() => { auth.logout(); navigate('/login') }}
              >
                <LogOut size={14} /> {t('signOut')}
              </button>
            </div>
          </div>
        </div>
        <BackendBanner />
      </header>

      <div className="lg:flex lg:flex-1 lg:items-stretch lg:overflow-hidden">
        {/* Desktop sidebar. */}
        <aside className="hidden w-[232px] shrink-0 overflow-y-auto border-r-2 border-ink bg-white lg:block">
          {sidebar}
        </aside>

        <main className="mx-auto max-w-lg px-4 py-4 lg:mx-0 lg:max-w-none lg:flex-1 lg:overflow-y-auto lg:px-9 lg:py-8">
          {children}
        </main>
      </div>

      {nav}
    </div>
  )
}

/** Information-dense shell for recycler and admin. */
export function DeskShell({ items, title, subtitle, children }) {
  const navigate = useNavigate()
  useCurrentUser() // re-render when the signed-in identity changes
  const { t } = useI18n()
  return (
    <div className="min-h-dvh bg-mint paper-grid">
      <header className="border-b-[3px] border-ink bg-board text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <BackButton dark homes={['/recycler', '/admin']} />
          <div>
            <div className="font-display text-xl leading-none tracking-wide">{title}</div>
            <div className="text-xs text-white/70">{subtitle}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ConnectionPill dark />
            <LanguageSwitcher dark />
            <button
              type="button"
              className="btn border-white/40 bg-white/10 px-3 py-1.5 text-sm text-white"
              onClick={() => {
                auth.logout()
                navigate('/login')
              }}
            >
              <LogOut size={15} /> {t('signOut')}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-t-2 border-x-2 px-3.5 py-2 text-sm font-semibold ${
                  isActive
                    ? 'border-ink bg-mint text-ink'
                    : 'border-transparent text-white/75 hover:text-white'
                }`
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {item.icon}
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>
      </header>
      <BackendBanner />
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  )
}

export function BottomNav({ items }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-white lg:hidden">
      <div className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                isActive ? 'bg-board text-white' : 'text-ink'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
