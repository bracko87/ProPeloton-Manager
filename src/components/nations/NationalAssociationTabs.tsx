import React from 'react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

export default function NationalAssociationTabs(): JSX.Element {
  const { t: navigationT } = useTranslation('navigation')
  const { t: nationsT } = useTranslation('nations')

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    [
      'rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap',
      isActive
        ? 'bg-yellow-400 text-black'
        : 'text-gray-600 hover:bg-gray-100',
    ].join(' ')

  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
      <NavLink to="/dashboard/national-association" end className={linkClass}>
        {navigationT('overview')}
      </NavLink>
      <NavLink to="/dashboard/national-association/team-package" className={linkClass}>
        {nationsT('association.package.tab')}
      </NavLink>
      <NavLink to="/dashboard/national-association/world-nations" className={linkClass}>
        {nationsT('association.tabs.competition')}
      </NavLink>
      <NavLink to="/dashboard/national-association/elections" className={linkClass}>
        {nationsT('association.tabs.elections')}
      </NavLink>
      <NavLink to="/dashboard/national-association/team-chat" className={linkClass}>
        {nationsT('association.tabs.teamChat')}
      </NavLink>
      <NavLink to="/dashboard/national-association/history" className={linkClass}>
        {nationsT('association.tabs.history')}
      </NavLink>
    </div>
  )
}
