/**
 * ClubDashboard.tsx
 * Dashboard top-level wrapper that applies MainLayout for all in-game pages.
 */

import React from 'react'
import MainLayout from '../../components/layout/MainLayout'

/**
 * ClubDashboard
 * Wraps child dashboard routes inside the MainLayout.
 *
 * Note: Authentication gating and data fetching should be handled through Supabase.
 */
export default function ClubDashboard() {
  return <MainLayout />
}