/**
 * src/lib/saveClubLogo.ts
 *
 * Helper to upload a club logo and persist the resulting public URL to the
 * clubs table (logo_path column).
 *
 * Purpose:
 * - Reuse uploadClubLogo for storage upload.
 * - Update the clubs row with the returned public URL.
 * - Provide a variant that saves a direct logo URL without file upload.
 */

import { supabase } from './supabase'
import { uploadClubLogo } from './uploadClubLogo'

/**
 * saveClubLogo
 *
 * Upload a club logo file and save the public URL to the clubs.logo_path column.
 *
 * @param clubId - The club's id to associate the uploaded file with
 * @param file - The File to upload
 * @returns The public URL string for the uploaded logo
 * @throws Error when upload or DB update fails
 */
export async function saveClubLogo(clubId: string, file: File): Promise<string> {
  const publicUrl = await uploadClubLogo({ clubId, file })

  const { error } = await supabase
    .from('clubs')
    .update({ logo_path: publicUrl })
    .eq('id', clubId)

  if (error) {
    throw new Error(`Failed to save club logo: ${error.message}`)
  }

  return publicUrl
}

/**
 * saveClubLogoFromUrl
 *
 * Save a logo URL directly to the clubs.logo_path column without uploading a file.
 *
 * @param clubId - The club's id to associate the URL with
 * @param logoUrl - The direct URL to the logo image
 * @throws Error when DB update fails
 */
export async function saveClubLogoFromUrl(
  clubId: string,
  logoUrl: string,
): Promise<void> {
  const normalizedUrl = logoUrl.trim()

  const { error } = await supabase
    .from('clubs')
    .update({ logo_path: normalizedUrl || null })
    .eq('id', clubId)

  if (error) {
    throw new Error(`Failed to save club logo URL: ${error.message}`)
  }
}