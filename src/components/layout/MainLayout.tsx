/**
 * MainLayout.tsx
 * Layout used for in-game pages: retractable sidebar, header, content, and footer with game-time.
 */

import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'

/**
 * MainLayoutProps
 * Layout props (reserved for future use).
 */
interface MainLayoutProps {}

/**
 * MainLayout
 * Wraps dashboard pages with consistent header, sidebar and footer.
 */
export default function MainLayout(_: MainLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="flex-1 flex flex-col">
        <Header
          onToggle={() => setCollapsed(v => !v)}
          title="ProPeloton Manager"
          route={location.pathname}
        />
        <main className="p-6 lg:p-8 flex-1 overflow-auto">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
