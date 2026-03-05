/**
 * supabase.ts
 * Local finance folder supabase re-export.
 *
 * Purpose:
 * - Provide a local module that other finance pages import from so the folder
 *   does not import a new client or directly refer to process.env.
 * - Keeps a single shared client in src/lib/supabase while allowing a
 *   finance-local import path.
 */

import { supabase } from '@/lib/supabase'

export { supabase }