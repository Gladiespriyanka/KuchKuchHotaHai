import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Save } from 'lucide-react'
import { LANGUAGES, useI18n } from '../../i18n'
import { api, auth } from '../../services/api'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { Notice } from '../../components/ui'

/**
 * Minimal profile screen. Its purpose is to prove the identity round-trip:
 * edit the name -> PATCH /api/auth/me -> database -> /api/auth/me refresh ->
 * every screen (including the home greeting) shows the new name.
 */
export default function Profile() {
  const { t, lang, setLang } = useI18n()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setName(user?.name ?? '') }, [user?.name])

  async function save() {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await auth.updateMe({ name: name.trim(), language: lang })
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">{t('profile')}</h1>

      {saved && <Notice tone="good">{t('profileSaved')}</Notice>}
      {error && <Notice tone="warn">{error}</Notice>}

      <div className="plate-lg p-4">
        <label className="eyebrow" htmlFor="pname">{t('yourName')}</label>
        <input
          id="pname" className="field mt-1" value={name}
          onChange={(e) => setName(e.target.value)} maxLength={120}
        />

        <div className="eyebrow mt-4">{t('language')}</div>
        <div className="mt-1 flex gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code} type="button" onClick={() => setLang(l.code)}
              className={`btn px-3 py-2 ${lang === l.code ? 'bg-board text-white' : 'bg-white'}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <button
          className="btn-primary mt-4 w-full text-lg"
          disabled={busy || !name.trim() || name.trim().length < 2}
          onClick={save}
        >
          <Save size={18} /> {t('saveChanges')}
        </button>
      </div>

      <div className="plate p-3 text-sm">
        <dl className="space-y-1">
          <Row label={t('email')} value={user?.email} />
          <Row label="Role" value={user?.role} />
          <Row label={t('yourArea')} value={user?.location} />
          <Row label="Collector ID" value={user?.profile_id} />
        </dl>
      </div>

      <button
        className="btn-ghost w-full justify-center"
        onClick={() => { auth.logout(); navigate('/login') }}
      >
        <LogOut size={16} /> {t('signOut')}
      </button>

      <p className="pb-2 text-center text-[11px] text-slate2">
        {api.mode === 'demo' ? 'Demo mode — changes are in-browser only.' : 'Saved to the backend database.'}
      </p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-ink/15 pb-1 last:border-0">
      <dt className="text-slate2">{label}</dt>
      <dd className="num text-right font-semibold">{value ?? '—'}</dd>
    </div>
  )
}
