import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Recycle, ShieldCheck, Smartphone, Truck, UserRound } from 'lucide-react'
import { useI18n } from '../i18n'
import { auth, catalog } from '../services/api'
import { LanguageSwitcher } from '../components/Shell'
import { DesktopDecor } from '../components/DesktopDecor'
import { AuthGrid, AuthHeader, AuthSideDecor } from '../components/AuthLayout'

const DEMO = [
  { role: 'collector', icon: <UserRound size={18} />, home: '/app', phone: '+91 98100 00001', email: 'collector@demo.com' },
  { role: 'recycler', icon: <Truck size={18} />, home: '/recycler', phone: '+91 98290 10001', email: 'recycler@demo.com' },
  { role: 'admin', icon: <ShieldCheck size={18} />, home: '/admin', phone: '+91 99100 0004', email: 'admin@demo.com' },
]

export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()

  // Initialize role state FIRST to prevent "Cannot access 'role' before initialization" error
  const [role, setRole] = useState('collector')

  // Determine login method based on whether the selected role has a phone number
  const [phone, setPhone] = useState('')

  // Initialize form values based on selected role
  useEffect(() => {
    const demoAccount = DEMO.find(d => d.role === role)
    if (demoAccount) {
      if (demoAccount.phone) {
        // Role uses phone + OTP
        setPhone(demoAccount.phone || '')
      }
    }
  }, [role])
  const [otpStage, setOtpStage] = useState('phone') // 'phone' | 'otp'
  const [otpCode, setOtpCode] = useState('')
  const [demoOtp, setDemoOtp] = useState('')
  const [name, setName] = useState('') // For new collector registrations
  const [collectorName, setCollectorName] = useState('')
  const [area, setArea] = useState('Pune')
  const [cities, setCities] = useState([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const routeFor = (r) => (r === 'admin' ? '/admin' : r === 'recycler' ? '/recycler' : '/app')

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

  function afterAuth(result, expectedRole) {
    const actual = result.user.role
    if (actual !== expectedRole) {
      auth.logout()
      setError(t('roleMismatch').replace('{selected}', t(expectedRole)).replace('{actual}', t(actual)))
      return
    }
    navigate(routeFor(actual))
  }

  async function sendOtp(e) {
    e?.preventDefault()
    if (!phone.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await auth.requestOtp(phone.trim())
      setDemoOtp(res.demo_otp || '')
      setOtpCode('')
      setOtpStage('otp')
    } catch (err) {
      setError(err.message || t('wrongLogin'))
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp(e) {
    e?.preventDefault()
    if (!otpCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await auth.verifyOtp(phone.trim(), otpCode.trim(), {
        // Only collectors need to provide name during OTP verification for registration
        ...(role === 'collector' && name.trim() ? { name: collectorName.trim() || undefined } : {}),
        ...(role !== 'collector' ? { operating_location: area } : {}),
        // Send role for backend to properly handle all three roles
        role: role
      })
      afterAuth(result, role)
    } catch (err) {
      setError(err.message || t('wrongLogin'))
    } finally {
      setBusy(false)
    }
  }

  function resetOtpFlow() {
    setOtpStage('phone')
    setOtpCode('')
    setDemoOtp('')
    setError('')
    // Reset role-specific fields when changing phone
    if (role === 'collector') {
      setCollectorName('')
      setName('')
    } else {
      setArea('Pune')
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
                  onClick={() => {
                    setRole(r); setError('')
                    resetOtpFlow() // Reset form when switching roles
                  }}
                  className={`btn py-2 text-sm lg:py-3.5 lg:text-base ${role === r ? 'bg-board text-white' : 'bg-white'}`}
                >
                  {t(r)}
                </button>
              ))}
            </div>
          </div>

          <div className="plate-lg mt-3 p-4 lg:p-6">
            <div className="mb-3 flex items-center gap-2 text-slate2">
              <Smartphone size={16} />
              <span className="text-sm">{t('loginInstructions')}</span>
            </div>

            {otpStage === 'phone' ? (
              <form onSubmit={sendOtp}>
                <label className="eyebrow" htmlFor="phone">{t('phoneNumber')}</label>
                <input
                  id="phone" type="tel" inputMode="tel" placeholder={role === 'admin' ? 'email@demo.com' : '+91 98100 00001'}
                  className="field num mt-1 lg:h-14 lg:px-4 lg:text-lg" value={phone} required
                  onChange={(e) => setPhone(e.target.value)}
                />

                {/* Collector-specific fields for registration */}
                {role === 'collector' && (
                  <>
                    <label className="eyebrow mt-3 block" htmlFor="collectorName">
                      {t('yourName')} <span className="font-normal normal-case text-slate2">({t('firstTimeOnly')})</span>
                    </label>
                    <input
                      id="collectorName" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg"
                      value={collectorName} onChange={(e) => setCollectorName(e.target.value)}
                    />
                    <label className="eyebrow mt-3 block" htmlFor="area">{t('yourArea')}</label>
                    {cities.length ? (
                      <select id="area" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={area}
                              onChange={(e) => setArea(e.target.value)}>
                        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input id="area" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={area}
                             onChange={(e) => setArea(e.target.value)} />
                    )}
                  </>
                )}

                {/* Recycler/Admin location field */}
                {role !== 'collector' && (
                  <>
                    <label className="eyebrow mt-3 block" htmlFor="area">{t('yourArea')}</label>
                    {cities.length ? (
                      <select id="area" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={area}
                              onChange={(e) => setArea(e.target.value)}>
                        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input id="area" className="field mt-1 lg:h-14 lg:px-4 lg:text-lg" value={area}
                             onChange={(e) => setArea(e.target.value)} />
                    )}
                  </>
                )}

                {error && <p className="mt-3 border-2 border-copper bg-brass/15 p-2 text-sm">{error}</p>}
                <button type="submit" className="btn-primary mt-4 w-full text-lg lg:h-14 lg:text-xl" disabled={busy}>
                  {busy ? '…' : t('sendOtp')}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <p className="text-sm text-slate2">
                  {t('otpSentTo')} <span className="num font-semibold text-ink">{phone}</span>
                </p>
                {demoOtp && (
                  <p className="num mt-1 border-2 border-brass bg-brass/15 p-2 text-sm">
                    {t('demoOtpLabel')}: <span className="font-bold">{demoOtp}</span>
                  </p>
                )}
                <label className="eyebrow mt-3 block" htmlFor="otp">{t('enterOtp')}</label>
                <input
                  id="otp" type="text" inputMode="numeric" maxLength={8} autoFocus
                  className="field num mt-1 tracking-[0.3em] lg:h-14 lg:px-4 lg:text-lg" value={otpCode} required
                  onChange={(e) => setOtpCode(e.target.value)}
                />
                {error && <p className="mt-3 border-2 border-copper bg-brass/15 p-2 text-sm">{error}</p>}
                <button type="submit" className="btn-primary mt-4 w-full text-lg lg:h-14 lg:text-xl" disabled={busy}>
                  {busy ? '…' : t('verifyOtp')}
                </button>
                <div className="mt-3 flex justify-between text-sm font-semibold">
                  <button type="button" className="underline" onClick={resetOtpFlow}>
                    {t('changePhoneNumber')}
                  </button>
                  <button type="button" className="underline" onClick={sendOtp} disabled={busy}>
                    {t('resendOtp')}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-5">
            <div className="eyebrow mb-2">{t('demoAccounts')}</div>
            <div className="grid gap-2 lg:grid-cols-3 lg:gap-3">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  className="plate flex items-center gap-3 px-3 py-2.5 text-left lg:flex-col lg:items-center lg:gap-2 lg:py-4 lg:text-center"
                  onClick={() => {
                    setError('')
                    setRole(d.role)
                    setPhone(d.phone || '')
                    setOtpStage('phone')
                    setDemoOtp('')
                    // Reset role-specific fields
                    if (d.role === 'collector') {
                      setCollectorName('')
                      setName('')
                      setArea('Pune')
                    } else {
                      setArea('Pune')
                    }
                  }}
                >
                  <span className="border-2 border-ink bg-brass p-1.5">{d.icon}</span>
                  <span>
                    <span className="block font-semibold">{t(d.role)}</span>
                    <span className="num block text-xs text-slate2">
                      {d.phone ||
                        (d.role === 'admin' ? 'email/password login' : '—')}
                    </span>
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