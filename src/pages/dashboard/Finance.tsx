/**
 * Finance.tsx
 * Finance overview template with budget and sponsor placeholders.
 */

import React from 'react'

/**
 * FinancePage
 * Displays income/expense cards; prepared for Supabase financial records.
 */
export default function FinancePage() {
  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Finance</h2>

      <div className="grid grid-cols-3 gap-4 w-full">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Current Balance</div>
          <div className="text-2xl font-bold mt-2">€1,250,000</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Monthly Income</div>
          <div className="text-2xl font-bold mt-2">€240,000</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Monthly Expenses</div>
          <div className="text-2xl font-bold mt-2">€180,000</div>
        </div>
      </div>

      <div className="mt-6 bg-white p-4 rounded shadow w-full">
        <h4 className="font-semibold">Sponsors</h4>
        <div className="mt-3 text-sm text-gray-600">
          No active sponsors — explore sponsor marketplace to increase revenue.
        </div>
      </div>
    </div>
  )
}