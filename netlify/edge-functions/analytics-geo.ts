export default async function analyticsGeo(
  _request: Request,
  context: any,
): Promise<Response> {
  const rawCode =
    context?.geo?.country?.code ??
    context?.geo?.countryCode ??
    'XX'

  const countryCode = /^[A-Za-z]{2}$/.test(String(rawCode))
    ? String(rawCode).toUpperCase()
    : 'XX'

  return new Response(JSON.stringify({ countryCode }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}
