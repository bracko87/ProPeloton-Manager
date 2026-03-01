/**
 * App.tsx
 * Main application router and route registration for ProPeloton Manager.
 */

import { HashRouter, Route, Routes, Navigate } from 'react-router'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import CreateClubPage from './pages/CreateClub'
import ClubDashboard from './pages/dashboard/ClubDashboard'
import OverviewPage from './pages/dashboard/Overview'
import SquadPage from './pages/dashboard/Squad'
import CalendarPage from './pages/dashboard/CalendarPage'
import TeamSchedulePage from './pages/dashboard/TeamSchedule'
import InfrastructurePage from './pages/dashboard/Infrastructure'
import FinancePage from './pages/dashboard/Finance'
import TransfersPage from './pages/dashboard/Transfers'
import StatisticsPage from './pages/dashboard/Statistics'

/**
 * App
 * Application router. Routes intended to be wired to Supabase-auth later.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/create-club" element={<CreateClubPage />} />

        <Route path="/dashboard" element={<ClubDashboard />}>
          <Route index element={<OverviewPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="squad" element={<SquadPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="team-schedule" element={<TeamSchedulePage />} />
          <Route path="infrastructure" element={<InfrastructurePage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
