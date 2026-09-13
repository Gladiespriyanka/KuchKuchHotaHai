import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Recycle, ShieldCheck, Truck, UserRound } from 'lucide-react'
import { useI18n } from '../i18n'
import { auth, catalog } from '../services/api'
import { LanguageSwitcher } from '../components/Shell'
import { DesktopDecor } from '../components/DesktopDecor'
import { AuthGrid, AuthHeader, AuthSideDecor } from '../components/AuthLayout'

const DEMO = [
  { role: 'collector', email: 'collector@demo.com', icon: <UserRound size={18} />, home: '/app' },
  { role: 'recycler', email: 'recycler@demo.com', icon: <Truck size={18} />, home: '/recycler' },
  { role: 'admin', email: 'admin@demo.com', icon: <ShieldCheck size={18} />, home: '/admin' },
]

export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('collector@demo.com')
  const [password, setPassword] = useState('password123')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login')
  // The account type the user selected. It drives the sign-up copy and is
  // checked against the role the backend actually returns.
  const [role, setRole] = useState('collector')
  const [name, setName] = useState('')
  const [area, setArea] = useState('Pune')
  const [cities, setCities] = useState([])

  const routeFor = (role) => (role === 'admin' ? '/admin' : role === 'recycler' ? '/recycler' : '/app')

  // Cities the platform has authorised recyclers in. Registering into a city
  // with no recyclers means no lot can ever be matched.
  useEffect(() => {
    catalog.cities?.().then((list) => {
      if (Array.isArray(list) && list.length) {
        setCities(list)
        setArea((a) => (list.includes(a) ? a : list[0]))
      }
    }).catch(() => {})
  }, [])

  async function submit(e) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result =
        mode === 'login'
          ? await auth.login(email, password)
          : await auth.register({
              name, email, password, language: 'hi', operating_location: area,
            })

      // The authenticated role is the backend's answer, never the email or the
      // selected chip. If the two disagree, say so instead of silently
      // dropping the user on the collector dashboard.
      const actual = result.user.role
      if (actual !== role) {
        auth.logout()
        setError(t('roleMismatch').replace('{selected}', t(role)).replace('{actual}', t(actual)))
        return
      }
      navigate(routeFor(actual))
    } catch (err) {
      setError(err.message || t('wrongLogin'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-mint paper-grid lg:flex lg:flex-col">
      <DesktopDecor />
      <AuthHeader />

      <AuthGrid>
        {/* Mobile-only header row: desktop uses AuthHeader instead. */}
        <div className="flex items-center justify-between lg:hidden">
          <button type="button" className="btn-ghost px-2 py-1.5"
                  onClick={() => navigate('/welcome')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <LanguageSwitcher />
        </div>

        {/* Left column (desktop only): editorial sustainability message. */}
        <div className="hidden lg:block">
          <h1 className="font-display text-[clamp(1.9rem,2.1vw+0.9rem,3.25rem)] leading-[1.3] text-ink">
            {t('loginHeadline1')}
            <br />
            {t('loginHeadline2')}
          </h1>
          <div className="mt-5 h-1.5 w-24 bg-copper" />
          <p className="mt-6 max-w-xs text-base leading-relaxed text-slate2">{t('tagline')}</p>
        </div>

        {/* Mobile-only hero: the rate board itself is the pitch. Desktop has
            this in the AuthHeader already, so it would be a duplicate here. */}
        <div className="lg:hidden">
          <div className="mt-6 border-[3px] border-ink bg-boardDark p-5 shadow-plate">
            <div className="flex items-center gap-2 text-brass">
              <Recycle size={22} strokeWidth={2.5} />
              <span className="font-display text-2xl tracking-wide">{t('appName')}</span>
            </div>
            <p className="mt-2 text-sm leading-snug text-white/75">{t('tagline')}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
              {[
                ['₹', 'fair rate'],
                ['✅', 'authorised'],
                ['⛓', 'traceable'],
              ].map(([sym, label]) => (
                <div key={label} className="text-center">
                  <div className="num text-xl text-brass">{sym}</div>
                  <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center column: account type + form + demo accounts. Single column on mobile. */}
        <div className="lg:mx-auto lg:w-full lg:max-w-[680px]">
          {/* Account type. Kept in sync with the demo picker below. */}
          <div className="mt-5 lg:mt-0">
            <div className="eyebrow mb-1">{t('accountType')}</div>
            <div className="grid grid-cols-3 gap-2 lg:gap-3">
              {['collector', 'recycler', 'admin'].map((r) => (
                <button
                  key={r} type="button"
                  onClick={() => { setRole(r); setError(''); if (r === 'admin') setMode('login') }}
                  className={`btn py-2 text-sm lg:py-3.5 lg:text-base ${role === r ? 'bg-board text-white' : 'bg-white'}`}
                >
                  {t(r)}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="plate-lg mt-3 p-4 lg:p-6">
            {mode === 'register' && (
              <>
                <label className="eyebrow" htmlFor="name">{t('yourName')}</label>
                <input id="name" className="field mt-1 mb-3 lg:h-14 lg:px-4 lg:text-lg" value={name} required
                       onChange={(e) => setName(e.target.value)} />
                <label className="eyebrow" htmlFor="area">{t('yourArea')}</label>
                {cities.length ? (
                  <select id="area" className="field mt-1 mb-3 lg:h-14 lg:px-4 lg:text-lg" value={area}
                          onChange={(e) => setArea(e.target.value)}>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input id="area" className="field mt-1 mb-3 lg:h-14 lg:px-4 lg:text-lg" value={area}
                         onChange={(e) => setArea(e.target.value)} />
                )}
              </>
            )}
            <label className="eyebrow" htmlFor="email">{t('email')}</label>
            <input id="email" type="email" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={email} required
                   onChange={(e) => setEmail(e.target.value)} />
            <label className="eyebrow mt-3 block" htmlFor="password">{t('password')}</label>
            <input id="password" type="password" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={password} required
                   onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="mt-3 border-2 border-copper bg-brass/15 p-2 text-sm">{error}</p>}
            <button type="submit" className="btn-primary mt-4 w-full text-lg lg:h-14 lg:text-xl" disabled={busy}>
              {busy ? '…' : mode === 'login' ? t('signIn') : t('register')}
            </button>
            {/* Admin accounts are provisioned, not self-registered. */}
            {role === 'admin' ? (
              mode === 'register' ? (
                <button type="button" className="mt-3 w-full text-sm font-semibold underline"
                        onClick={() => { setMode('login'); setError('') }}>
                  {t('backToSignIn')}
                </button>
              ) : (
                <p className="mt-3 text-center text-xs text-slate2">{t('adminNoSignup')}</p>
              )
            ) : (
              <button
                type="button"
                className="mt-3 w-full text-sm font-semibold underline"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
              >
                {mode === 'login'
                  ? (role === 'recycler' ? t('createRecyclerAccount') : t('createCollectorAccount'))
                  : t('backToSignIn')}
              </button>
            )}
          </form>

          <div className="mt-5">
            <div className="eyebrow mb-2">{t('demoAccounts')} · password123</div>
            <div className="grid gap-2 lg:grid-cols-3 lg:gap-3">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  className="plate flex items-center gap-3 px-3 py-2.5 text-left lg:flex-col lg:items-center lg:gap-2 lg:py-4 lg:text-center"
                  onClick={() => {
                    setMode('login'); setRole(d.role); setError('')
                    setEmail(d.email); setPassword('password123')
                  }}
                >
                  <span className="border-2 border-ink bg-brass p-1.5">{d.icon}</span>
                  <span>
                    <span className="block font-semibold">{t(d.role)}</span>
                    <span className="num block text-xs text-slate2">{d.email}</span>
                  </span>
                  <span className="ml-auto text-xs font-semibold underline lg:ml-0">{t('useAccount')}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate2">
              Demo accounts and prototype data only. Recyclers shown in this app are fictional and are
              not government-authorised businesses.
            </p>
          </div>
        </div>

        {/* Right column (desktop only): environmental decoration. */}
        <AuthSideDecor words={['Cleaner Cities', 'Greener Future']} />
      </AuthGrid>
    </div>
  )
}
