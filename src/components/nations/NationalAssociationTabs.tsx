import React from 'react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

export default function NationalAssociationTabs({
  isCoach = false,
}: {
  isCoach?: boolean
}): JSX.Element {
  const { t: navigationT } = useTranslation('navigation')
  const { t: nationsT } = useTranslation('nations')

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    [
      'rounded-md px-2.5 py-2 text-[13px] font-medium transition whitespace-nowrap',
      isActive
        ? 'bg-yellow-400 text-black'
        : 'text-gray-600 hover:bg-gray-100',
    ].join(' ')

  return (
    <div className="inline-flex max-w-full flex-nowrap overflow-x-auto rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
      <NavLink to="/dashboard/national-association" end className={linkClass}>
        {navigationT('overview')}
      </NavLink>

      {isCoach ? (
        <NavLink to="/dashboard/national-association/squad" className={linkClass}>
          {nationsT('association.tabs.squad')}
        </NavLink>
      ) : (
        <button
          type="button"
          disabled
          title={nationsT('association.tabs.coachLocked')}
          className="cursor-not-allowed rounded-md px-2.5 py-2 text-[13px] font-medium text-gray-400 opacity-70 whitespace-nowrap"
        >
          {nationsT('association.tabs.squad')}
        </button>
      )}

      {isCoach ? (
        <NavLink to="/dashboard/national-association/team-package" className={linkClass}>
          {nationsT('association.package.tab')}
        </NavLink>
      ) : (
        <button
          type="button"
          disabled
          title={nationsT('association.tabs.coachLocked')}
          className="cursor-not-allowed rounded-md px-2.5 py-2 text-[13px] font-medium text-gray-400 opacity-70 whitespace-nowrap"
        >
          {nationsT('association.package.tab')}
        </button>
      )}

      <NavLink to="/dashboard/national-association/world-nations" className={linkClass}>
        {nationsT('association.tabs.competition')}
      </NavLink>
      <NavLink to="/dashboard/national-association/elections" className={linkClass}>
        {nationsT('association.tabs.elections')}
      </NavLink>
      <NavLink to="/dashboard/national-association/team-chat" className={linkClass}>
        {nationsT('association.tabs.chat', { defaultValue: 'Chat' })}
      </NavLink>
      <NavLink to="/dashboard/national-association/history" className={linkClass}>
        {nationsT('association.tabs.history')}
      </NavLink>
    </div>
  )
}
