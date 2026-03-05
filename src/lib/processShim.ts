/**
 * src/lib/processShim.ts
 *
 * Minimal runtime shim to avoid "ReferenceError: process is not defined" in the browser.
 *
 * Purpose:
 * - Some third-party libs or build outputs expect `process` to exist. On certain
 *   environments (esbuild + browser) `process` may be missing which causes a
 *   runtime ReferenceError. This file creates a tiny safe shim on globalThis.
 *
 * Notes:
 * - Keeps the shim intentionally small: only `process.env` is ensured so code
 *   reading process.env.* won't crash. Do not add secrets here.
 */

/**
 * ensureProcessShim
 * Ensure a minimal `process` object exists on globalThis.
 */
function ensureProcessShim(): void {
  if (typeof (globalThis as any).process === 'undefined') {
    ;(globalThis as any).process = { env: {} }
    return
  }

  if (typeof (globalThis as any).process.env === 'undefined') {
    ;(globalThis as any).process.env = {}
  }
}

// Run the shim immediately so importing this module is sufficient.
ensureProcessShim()

export default ensureProcessShim