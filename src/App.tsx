// App.tsx
/**
 * App.tsx
 * Main application router and route registration for ProPeloton Manager.
 *
 * Purpose:
 * - Wrap the app with AuthProvider to keep Supabase auth state in memory.
 * - Add route guards for /create-club and /dashboard/* that rely on Supabase auth
 *   and the backend RPC get_my_club_id() to decide routing.
 * - Provide small loading and error states in guards instead of blank screens.
 */

/**
 * Import lightweight process shim early to avoid "process is not defined"
 * runtime errors coming from some dependencies or build outputs.
 */
import './lib/processShim'
import './styles/hideQuote.css'

import React, { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, Navigate } from 'react-router'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import CreateClubPage from './pages/CreateClub'
import ClubDashboard from './pages/dashboard/ClubDashboard'
import OverviewPage from './pages/dashboard/Overview'
import SquadPage from './pages/dashboard/Squad'
import DevelopingTeamPage from './pages/dashboard/DevelopingTeam'
import StaffPage from './pages/dashboard/Staff'
import CalendarPage from './pages/dashboard/CalendarPage'
import TeamSchedulePage from './pages/dashboard/TeamSchedule'
import TeamRankingPage from './pages/dashboard/TeamRanking'
import TeamProfilePage from './pages/dashboard/TeamProfilePage'
import SeasonResetPreviewPage from './pages/dashboard/SeasonResetPreview'
import TrainingPage from './pages/dashboard/Training'
import CurrentTrainingCampPage from './pages/dashboard/training/CurrentTrainingCampPage'
import EquipmentPage from './pages/dashboard/Equipment'
import InfrastructurePage from './pages/dashboard/Infrastructure'
import FinancePage from './pages/dashboard/Finance'
import TransfersPage from './pages/dashboard/Transfers'
import NotificationsPage from './pages/dashboard/NotificationsPage'
import ScoutingPage from './pages/dashboard/ScoutingPage'
import RiderTransferNegotiationPage from './pages/dashboard/transfers/RiderTransferNegotiationPage'
import RiderFreeAgentNegotiationPage from './pages/dashboard/transfers/RiderFreeAgentNegotiationPage'
import StatisticsPage from './pages/dashboard/Statistics'
import RiderProfilePublicPage from './pages/dashboard/riders/RiderProfilePublicPage'
import RiderProfileOwnPage from './pages/dashboard/riders/RiderProfileOwnPage'
import CompareRidersPage from './pages/dashboard/CompareRiders'
import ExternalRiderProfilePage from './features/squad/components/ExternalRiderProfilePage'

/* Additional pages for profile/menu */
import InboxPage from './pages/Inbox'
import MyProfilePage from './pages/MyProfile'
import CustomizeTeamPage from './pages/CustomizeTeam'
import ForumPage from './pages/Forum'
import PreferencesPage from './pages/Preferences'
import HelpPage from './pages/Help'
import ContactUsPage from './pages/ContactUs'
import ProPackagesPage from './pages/ProPackages'
import InviteFriendsPage from './pages/InviteFriends'
import ReferralCapturePage from './pages/ReferralCapture'
import { AuthProvider, useAuth } from './context/AuthProvider'
import { validateTeamRankingConfig } from './constants/teamRanking.validation'
import { supabase } from './lib/supabase'

/**
 * Validate team ranking configuration at startup to catch config mistakes early.
 * Any thrown error will be logged so developers can fix the constants.
 */
try {
  validateTeamRankingConfig()
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Team ranking configuration validation failed:', e)
}

/**
 * GuardProps
 * Props for guard components.
 */
interface GuardProps {
  children: JSX.Element
}

/**
 * LoadingScreenProps
 * Props for the simple loading screen used by guards.
 */
interface LoadingScreenProps {
  label?: string
}

/**
 * ErrorScreenProps
 * Props for the simple error screen used by guards.
 */
interface ErrorScreenProps {
  message: string
}

/**
 * LoadingScreen
 * Minimal full-screen loading indicator used in route guards.
 */
function LoadingScreen({ label = 'Loading...' }: LoadingScreenProps): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-2">
        <div
          className="h-8 w-8 rounded-full border-2 border-slate-500 border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300">{label}</p>
      </div>
    </div>
  )
}

/**
 * GuardErrorScreen
 * Minimal full-screen error message used when guards hit RPC errors.
 */
function GuardErrorScreen({ message }: ErrorScreenProps): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="max-w-md text-center space-y-2 px-6">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-slate-300">{message}</p>
      </div>
    </div>
  )
}

/**
 * RequireAuth
 * Ensures a user is authenticated; otherwise redirects to /login.
 */
function RequireAuth({ children }: GuardProps): JSX.Element | null {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen label="Checking your session..." />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * RequireNoClub
 * For /create-club:
 * - If user already has a club, redirect to /dashboard/overview.
 * - If RPC fails, show an error state instead of misrouting.
 */
function RequireNoClub({ children }: GuardProps): JSX.Element | null {
  const { user, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [hasClub, setHasClub] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      if (!user) {
        if (mounted) setChecking(false)
        return
      }

      const { data, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (!mounted) return

      if (rpcError) {
        setError('Unable to check your club status right now. Please try again shortly.')
        setChecking(false)
        return
      }

      setHasClub(Boolean(data))
      setChecking(false)
    })()

    return () => {
      mounted = false
    }
  }, [user])

  if (loading || checking) {
    return <LoadingScreen label="Preparing club creation..." />
  }

  if (error) {
    return <GuardErrorScreen message={error} />
  }

  if (hasClub) {
    return <Navigate to="/dashboard/overview" replace />
  }

  return children
}

/**
 * RequireClub
 * For /dashboard/*:
 * - Allows access only if the authenticated user has a club.
 * - If not, redirect to /create-club.
 * - If RPC fails, show an error state instead of misrouting.
 */
function RequireClub({ children }: GuardProps): JSX.Element | null {
  const { user, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [hasClub, setHasClub] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      if (!user) {
        if (mounted) setChecking(false)
        return
      }

      const { data, error: rpcError } = await supabase.rpc('get_my_club_id')

      if (!mounted) return

      if (rpcError) {
        setError('Unable to load your club at the moment. Please try again shortly.')
        setChecking(false)
        return
      }

      setHasClub(Boolean(data))
      setChecking(false)
    })()

    return () => {
      mounted = false
    }
  }, [user])

  if (loading || checking) {
    return <LoadingScreen label="Loading your club..." />
  }

  if (error) {
    return <GuardErrorScreen message={error} />
  }

  if (!hasClub) {
    return <Navigate to="/create-club" replace />
  }

  return children
}

/**
 * App
 * Application router with auth and club-based route protection.
 *
 * Help quick-link destinations are aligned to valid registered dashboard routes,
 * including overview, transfers, notifications, scouting, and invite-friends.
 *
 * Training camp routes:
 * - /dashboard/training/current-camp
 * - /dashboard/training/current-camp/:campId
 *
 * CurrentTrainingCampPage expects this RPC later:
 * - training_get_current_camp(p_camp_id uuid default null)
 */
export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/referral/:code" element={<ReferralCapturePage />} />

          <Route
            path="/create-club"
            element={
              <RequireAuth>
                <RequireNoClub>
                  <CreateClubPage />
                </RequireNoClub>
              </RequireAuth>
            }
          />

          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <RequireClub>
                  <ClubDashboard />
                </RequireClub>
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="squad" element={<SquadPage />} />
            <Route path="developing-team" element={<DevelopingTeamPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="team-schedule" element={<TeamSchedulePage />} />
            <Route path="team-ranking" element={<TeamRankingPage />} />
            <Route path="teams/:clubId" element={<TeamProfilePage />} />
            <Route path="season-reset-preview" element={<SeasonResetPreviewPage />} />

            <Route path="training" element={<TrainingPage />} />
            <Route path="training/current-camp" element={<CurrentTrainingCampPage />} />
            <Route path="training/current-camp/:campId" element={<CurrentTrainingCampPage />} />

            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="infrastructure" element={<InfrastructurePage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="transfers" element={<TransfersPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="scouting" element={<ScoutingPage />} />

            <Route
              path="transfers/negotiations/:negotiationId"
              element={<RiderTransferNegotiationPage />}
            />
            <Route
              path="transfers/free-agent-negotiations/new"
              element={<RiderFreeAgentNegotiationPage />}
            />
            <Route
              path="transfers/free-agent-negotiations/:negotiationId"
              element={<RiderFreeAgentNegotiationPage />}
            />

            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="riders/:riderId" element={<RiderProfilePublicPage />} />
            <Route path="my-riders/:riderId" element={<RiderProfileOwnPage />} />
            <Route path="external-riders/:riderId" element={<ExternalRiderProfilePage />} />
            <Route path="compare-riders" element={<CompareRidersPage />} />

            <Route path="inbox" element={<InboxPage />} />
            <Route path="my-profile" element={<MyProfilePage />} />
            <Route path="customize-team" element={<CustomizeTeamPage />} />
            <Route path="forum" element={<ForumPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="contact-us" element={<ContactUsPage />} />
            <Route path="pro" element={<ProPackagesPage />} />
            <Route path="pro-packages" element={<ProPackagesPage />} />
            <Route path="invite-friends" element={<InviteFriendsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}