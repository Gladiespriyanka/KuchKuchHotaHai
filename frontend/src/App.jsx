import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Calculator, CalendarClock, Coins, Home as HomeIcon, Map, Package, Receipt, Recycle,
  ScanLine, ShieldCheck, Table2, UserRound, Wallet,
} from 'lucide-react'
import { I18nProvider, useI18n } from './i18n'
import { api, auth, setUnauthorizedHandler, startHealthWatch } from './services/api'
import { useCurrentUser } from './hooks/useCurrentUser'
import { BottomNav, CollectorShell, DeskShell, SidebarNav } from './components/Shell'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import Home from './pages/collector/Home'
import NewLot from './pages/collector/NewLot'
import Prices from './pages/collector/Prices'
import Profile from './pages/collector/Profile'
import Estimate from './pages/collector/Estimate'
import Recyclers from './pages/collector/Recyclers'
import FindRecycler from './pages/collector/FindRecycler'
import { LotDetail, MyLots } from './pages/collector/Lots'
import Earnings from './pages/collector/Earnings'
import Safety from './pages/collector/Safety'
import Pickups from './pages/collector/Pickups'
import RecyclerDashboard from './pages/recycler/Dashboard'
import Scan from './pages/recycler/Scan'
import Rates from './pages/recycler/Rates'
import PickupSchedule from './pages/recycler/PickupSchedule'
import VerifyLot from './pages/recycler/VerifyLot'
import AdminDashboard from './pages/admin/Dashboard'
import Trace from './pages/admin/Trace'
import { MapPage, Monitoring, Verification } from './pages/admin/Panels'

function Guard({ roles, children }) {
  const user = useCurrentUser()
  if (!user) return <Navigate to="/welcome" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />
  return children
}

function CollectorLayout({ children }) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const titles = {
    '/app': 'KabaadE',
    '/app/new': t('newLot'),
    '/app/prices': t('todaysPrices'),
    '/app/recyclers': t('findRecycler'),
    '/app/profile': t('profile'),
    '/app/estimate': t('estimator'),
    '/app/lots': t('myLots'),
    '/app/earnings': t('myEarnings'),
    '/app/safety': t('safety'),
    '/app/pickups': t('pickupSchedule'),
  }
  return (
    <CollectorShell
      title={titles[pathname] || 'KabaadE'}
      sidebar={
        <SidebarNav
          items={[
            { to: '/app', end: true, label: t('greeting'), icon: <HomeIcon size={18} /> },
            { to: '/app/new', label: t('sellEwaste'), icon: <Package size={18} /> },
            { to: '/app/prices', label: t('todaysPrices'), icon: <Coins size={18} /> },
            { to: '/app/recyclers', label: t('findRecycler'), icon: <Recycle size={18} /> },
            { to: '/app/earnings', label: t('myEarnings'), icon: <Wallet size={18} /> },
            { to: '/app/lots', label: t('myLots'), icon: <Receipt size={18} /> },
            { to: '/app/estimate', label: t('estimator'), icon: <Calculator size={18} /> },
            { to: '/app/safety', label: t('safety'), icon: <AlertTriangle size={18} /> },
            { to: '/app/pickups', label: t('pickupSchedule'), icon: <CalendarClock size={18} /> },
          ]}
          secondary={[
            { to: '/app/profile', label: t('profile'), icon: <UserRound size={18} /> },
          ]}
        />
      }
      nav={
        <BottomNav
          items={[
            { to: '/app', end: true, label: t('greeting'), icon: <HomeIcon size={20} /> },
            { to: '/app/new', label: t('sellEwaste'), icon: <Package size={20} /> },
            { to: '/app/prices', label: t('todaysPrices'), icon: <Coins size={20} /> },
            { to: '/app/recyclers', label: t('findRecycler'), icon: <Recycle size={20} /> },
            { to: '/app/earnings', label: t('myEarnings'), icon: <Wallet size={20} /> },
          ]}
        />
      }
    >
      {children}
    </CollectorShell>
  )
}

function RecyclerLayout({ children }) {
  const { t } = useI18n()
  const user = useCurrentUser()
  return (
    <DeskShell
      title="KabaadE"
      subtitle={`${t('recycler')} · ${user?.name ?? ''}`}
      items={[
        { to: '/recycler', end: true, label: t('dashboard'), icon: <BarChart3 size={15} /> },
        { to: '/recycler/scan', label: t('scanLotQr'), icon: <ScanLine size={15} /> },
        { to: '/recycler/rates', label: t('buyingRates'), icon: <Coins size={15} /> },
        { to: '/recycler/pickups', label: t('pickupSchedule'), icon: <CalendarClock size={15} /> },
      ]}
    >
      {children}
    </DeskShell>
  )
}

function AdminLayout({ children }) {
  const { t } = useI18n()
  return (
    <DeskShell
      title="KabaadE"
      subtitle={`${t('admin')} · platform operations`}
      items={[
        { to: '/admin', end: true, label: t('dashboard'), icon: <BarChart3 size={15} /> },
        { to: '/admin/verification', label: t('verification'), icon: <ShieldCheck size={15} /> },
        { to: '/admin/trace', label: t('traceability'), icon: <Package size={15} /> },
        { to: '/admin/monitoring', label: `${t('transactions')} · ${t('anomalies')}`, icon: <Table2 size={15} /> },
        { to: '/admin/map', label: t('map'), icon: <Map size={15} /> },
      ]}
    >
      {children}
    </DeskShell>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // A 401 anywhere clears the session and returns to the login screen.
    setUnauthorizedHandler(() => {
      window.location.hash = '#/login'
    })
    // Real health state, polled so the indicator recovers on its own.
    const stopWatch = startHealthWatch()
    // Confirm the cached identity against the backend before first paint.
    auth.restore().finally(() => setReady(true))
    return stopWatch
  }, [])

  if (!ready) return null

  return (
    <I18nProvider>
      <HashRouter>
        <Routes>
          {/* Landing page is the entry point; the login form sits behind it. */}
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login />} />

          <Route path="/app" element={<Guard roles={['collector']}><CollectorLayout><Home /></CollectorLayout></Guard>} />
          <Route path="/app/new" element={<Guard roles={['collector']}><CollectorLayout><NewLot /></CollectorLayout></Guard>} />
          <Route path="/app/prices" element={<Guard roles={['collector']}><CollectorLayout><Prices /></CollectorLayout></Guard>} />
          <Route path="/app/recyclers" element={<Guard roles={['collector']}><CollectorLayout><Recyclers /></CollectorLayout></Guard>} />
          <Route path="/app/lots" element={<Guard roles={['collector']}><CollectorLayout><MyLots /></CollectorLayout></Guard>} />
          <Route path="/app/lots/:lotId" element={<Guard roles={['collector']}><CollectorLayout><LotDetail /></CollectorLayout></Guard>} />
          <Route path="/app/lots/:lotId/match" element={<Guard roles={['collector']}><CollectorLayout><FindRecycler /></CollectorLayout></Guard>} />
          <Route path="/app/earnings" element={<Guard roles={['collector']}><CollectorLayout><Earnings /></CollectorLayout></Guard>} />
          <Route path="/app/safety" element={<Guard roles={['collector']}><CollectorLayout><Safety /></CollectorLayout></Guard>} />
          <Route path="/app/pickups" element={<Guard roles={['collector']}><CollectorLayout><Pickups /></CollectorLayout></Guard>} />
          <Route path="/app/profile" element={<Guard roles={['collector']}><CollectorLayout><Profile /></CollectorLayout></Guard>} />
          <Route path="/app/estimate" element={<Guard roles={['collector']}><CollectorLayout><Estimate /></CollectorLayout></Guard>} />

          <Route path="/recycler" element={<Guard roles={['recycler']}><RecyclerLayout><RecyclerDashboard /></RecyclerLayout></Guard>} />
          <Route path="/recycler/scan" element={<Guard roles={['recycler']}><RecyclerLayout><Scan /></RecyclerLayout></Guard>} />
          <Route path="/recycler/rates" element={<Guard roles={['recycler']}><RecyclerLayout><Rates /></RecyclerLayout></Guard>} />
          <Route path="/recycler/pickups" element={<Guard roles={['recycler']}><RecyclerLayout><PickupSchedule /></RecyclerLayout></Guard>} />

          {/* QR target — opened by the recycler's camera */}
          <Route path="/verify/:lotId" element={<Guard roles={['recycler', 'admin']}><RecyclerLayout><VerifyLot /></RecyclerLayout></Guard>} />

          <Route path="/admin" element={<Guard roles={['admin']}><AdminLayout><AdminDashboard /></AdminLayout></Guard>} />
          <Route path="/admin/verification" element={<Guard roles={['admin']}><AdminLayout><Verification /></AdminLayout></Guard>} />
          <Route path="/admin/trace" element={<Guard roles={['admin']}><AdminLayout><Trace /></AdminLayout></Guard>} />
          <Route path="/admin/monitoring" element={<Guard roles={['admin']}><AdminLayout><Monitoring /></AdminLayout></Guard>} />
          <Route path="/admin/map" element={<Guard roles={['admin']}><AdminLayout><MapPage /></AdminLayout></Guard>} />

          <Route path="*" element={<Fallback />} />
        </Routes>
      </HashRouter>
    </I18nProvider>
  )
}

function Fallback() {
  const user = useCurrentUser()
  // Signed out visitors land on the welcome page, not straight on a form.
  return <Navigate to={user ? routeFor(user.role) : '/welcome'} replace />
}

function routeFor(role) {
  return role === 'admin' ? '/admin' : role === 'recycler' ? '/recycler' : '/app'
}
