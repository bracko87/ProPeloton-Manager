/**
 * send-contact-message
 * Supabase Edge Function for public Contact / Support forms.
 *
 * Flow:
 * React form -> save private admin copy -> Resend -> support inbox
 *
 * Required Supabase secrets:
 * - RESEND_API_KEY
 * - CONTACT_TO_EMAIL
 * - CONTACT_FROM_EMAIL
 * - ALLOWED_ORIGINS
 *
 * Supabase-provided runtime secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

type ContactPayload = {
  name?: unknown
  email?: unknown
  message?: unknown
  source?: unknown
  website?: unknown
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://propelotonmanager.com',
  'https://www.propelotonmanager.com',
]

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS')

  if (!raw || raw.trim().length === 0) {
    return DEFAULT_ALLOWED_ORIGINS
  }

  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function getCorsHeaders(request: Request): HeadersInit {
  const requestOrigin = request.headers.get('origin') ?? ''
  const allowedOrigins = getAllowedOrigins()

  const allowOrigin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] ?? '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  })
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildTextEmail(input: {
  name: string
  email: string
  message: string
  source: string
  contactMessageId: string | null
}): string {
  return [
    'New ProPeloton Manager support message',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Source: ${input.source}`,
    input.contactMessageId
      ? `Contact message ID: ${input.contactMessageId}`
      : '',
    '',
    'Message:',
    input.message,
  ]
    .filter((line, index, lines) => {
      if (line !== '') return true
      return index === 1 || index === lines.length - 2
    })
    .join('\n')
}

function buildHtmlEmail(input: {
  name: string
  email: string
  message: string
  source: string
  contactMessageId: string | null
}): string {
  const safeName = escapeHtml(input.name)
  const safeEmail = escapeHtml(input.email)
  const safeSource = escapeHtml(input.source)
  const safeMessage = escapeHtml(input.message).replaceAll('\n', '<br />')
  const safeContactMessageId = input.contactMessageId
    ? escapeHtml(input.contactMessageId)
    : null

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2>New ProPeloton Manager support message</h2>

      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Source:</strong> ${safeSource}</p>
      ${safeContactMessageId
        ? `<p><strong>Contact message ID:</strong> ${safeContactMessageId}</p>`
        : ''}

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

      <h3>Message</h3>
      <p>${safeMessage}</p>
    </div>
  `
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      {
        ok: false,
        error: 'Method not allowed.',
      },
      405,
    )
  }

  let payload: ContactPayload | null = null

  try {
    payload = await request.json()
  } catch {
    return jsonResponse(
      request,
      {
        ok: false,
        error: 'Invalid request body.',
      },
      400,
    )
  }

  const name = normalizeString(payload?.name)
  const email = normalizeString(payload?.email)
  const message = normalizeString(payload?.message)
  const source = normalizeString(payload?.source) || 'contact-form'

  const website = normalizeString(payload?.website)
  if (website.length > 0) {
    return jsonResponse(request, { ok: true })
  }

  if (!name) {
    return jsonResponse(
      request,
      { ok: false, error: 'Please enter your name.' },
      400,
    )
  }

  if (name.length > 120) {
    return jsonResponse(
      request,
      { ok: false, error: 'Name is too long.' },
      400,
    )
  }

  if (!email) {
    return jsonResponse(
      request,
      { ok: false, error: 'Please enter your email address.' },
      400,
    )
  }

  if (!isProbablyValidEmail(email)) {
    return jsonResponse(
      request,
      { ok: false, error: 'Please enter a valid email address.' },
      400,
    )
  }

  if (email.length > 200) {
    return jsonResponse(
      request,
      { ok: false, error: 'Email is too long.' },
      400,
    )
  }

  if (!message) {
    return jsonResponse(
      request,
      { ok: false, error: 'Please write a message.' },
      400,
    )
  }

  if (message.length < 10) {
    return jsonResponse(
      request,
      { ok: false, error: 'Please write a little more detail.' },
      400,
    )
  }

  if (message.length > 5000) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: 'Message is too long. Please keep it under 5000 characters.',
      },
      400,
    )
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const contactToEmail =
    Deno.env.get('CONTACT_TO_EMAIL') ?? 'contact@propelotonmanager.com'
  const contactFromEmail =
    Deno.env.get('CONTACT_FROM_EMAIL') ??
    'ProPeloton Manager <no-reply@propelotonmanager.com>'

  if (!resendApiKey) {
    console.error('Missing RESEND_API_KEY secret')

    return jsonResponse(
      request,
      {
        ok: false,
        error: 'Contact service is not configured yet.',
      },
      500,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  let contactMessageId: string | null = null
  let authenticatedUserId: string | null = null
  let adminCopySaved = false

  const serviceClient =
    supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null

  if (serviceClient) {
    const bearerToken = getBearerToken(request)

    if (bearerToken) {
      try {
        const { data: userData } = await serviceClient.auth.getUser(bearerToken)
        authenticatedUserId = userData.user?.id ?? null
      } catch {
        authenticatedUserId = null
      }
    }

    try {
      const { data: savedMessage, error: saveError } = await serviceClient
        .from('contact_messages')
        .insert({
          user_id: authenticatedUserId,
          sender_name: name,
          sender_email: email.toLowerCase(),
          message,
          source,
          email_status: 'pending',
          admin_status: 'open',
        })
        .select('id')
        .single()

      if (saveError) {
        console.error('Could not save contact message admin copy', saveError)
      } else {
        contactMessageId = savedMessage?.id ?? null
        adminCopySaved = Boolean(contactMessageId)
      }
    } catch (saveError) {
      console.error('Unexpected contact message save failure', saveError)
    }
  } else {
    console.error(
      'Missing Supabase runtime secrets; contact message admin copy cannot be saved.',
    )
  }

  const emailInput = {
    name,
    email,
    message,
    source,
    contactMessageId,
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: contactFromEmail,
      to: [contactToEmail],
      reply_to: [email],
      subject: `ProPeloton Manager support request from ${name}`,
      text: buildTextEmail(emailInput),
      html: buildHtmlEmail(emailInput),
      tags: [
        {
          name: 'category',
          value: 'support',
        },
      ],
    }),
  })

  const resendData = await resendResponse.json().catch(() => null)
  const resendEmailId =
    resendData && typeof resendData === 'object' && 'id' in resendData
      ? String(resendData.id ?? '')
      : null

  if (!resendResponse.ok) {
    console.error('Resend send failed', resendData)

    if (serviceClient && contactMessageId) {
      const errorText = JSON.stringify(
        resendData ?? { status: resendResponse.status },
      ).slice(0, 2000)

      const { error: updateError } = await serviceClient
        .from('contact_messages')
        .update({
          email_status: 'failed',
          delivery_error: errorText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactMessageId)

      if (updateError) {
        console.error('Could not mark contact email as failed', updateError)
      }
    }

    return jsonResponse(
      request,
      {
        ok: false,
        error:
          'Could not send your message right now. Please try again later.',
        savedForSupport: adminCopySaved,
      },
      502,
    )
  }

  if (serviceClient && contactMessageId) {
    const { error: updateError } = await serviceClient
      .from('contact_messages')
      .update({
        email_status: 'sent',
        resend_email_id: resendEmailId,
        email_sent_at: new Date().toISOString(),
        delivery_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactMessageId)

    if (updateError) {
      console.error('Could not mark contact email as sent', updateError)
    }
  } else if (serviceClient && !contactMessageId) {
    try {
      const { data: retryMessage, error: retryError } = await serviceClient
        .from('contact_messages')
        .insert({
          user_id: authenticatedUserId,
          sender_name: name,
          sender_email: email.toLowerCase(),
          message,
          source,
          email_status: 'sent',
          resend_email_id: resendEmailId,
          email_sent_at: new Date().toISOString(),
          admin_status: 'open',
        })
        .select('id')
        .single()

      if (retryError) {
        console.error('Contact message admin-copy retry failed', retryError)
      } else {
        contactMessageId = retryMessage?.id ?? null
        adminCopySaved = Boolean(contactMessageId)
      }
    } catch (retryError) {
      console.error('Unexpected admin-copy retry failure', retryError)
    }
  }

  return jsonResponse(request, {
    ok: true,
    message: 'Message sent.',
    emailId: resendEmailId,
    contactMessageId,
    savedForSupport: adminCopySaved,
  })
})
