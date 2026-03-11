/**
 * src/lib/uploadClubLogo.ts
 *
 * Helper for uploading club logo files to Supabase storage and returning a
 * publicly accessible URL.
 */

import { supabase } from './supabase'

/**
 * getFileExtension
 *
 * Extract the file extension from a filename. Returns 'png' when none found.
 *
 * @param fileName - The original filename
 * @returns The file extension in lowercase (without the leading dot)
 */
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'png'
}

/**
 * uploadClubLogo
 *
 * Upload a club logo File to the 'club-assets' Supabase storage bucket and
 * return the generated public URL.
 *
 * @param args.clubId - The club id used to create a unique file path
 * @param args.file - The File object to upload
 * @returns Public URL string for the uploaded file
 * @throws Error when upload or public URL generation fails
 */
export async function uploadClubLogo(args: {
  clubId: string
  file: File
}): Promise<string> {
  const { clubId, file } = args

  const extension = getFileExtension(file.name)
  const filePath = `club-logos/${clubId}-${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('club-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Logo upload failed: ${uploadError.message}`)
  }

  // getPublicUrl returns an object with data.publicUrl in this codebase
  const {
    data: { publicUrl },
  } = supabase.storage.from('club-assets').getPublicUrl(filePath)

  if (!publicUrl) {
    throw new Error('Failed to generate public logo URL')
  }

  return publicUrl
}