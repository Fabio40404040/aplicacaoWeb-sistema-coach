export async function sendPasswordReset(env, message, fetcher = fetch) {
  const url = new URL(env.PASSWORD_MAILER_URL)
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error('Password mailer requires HTTPS')
  const response = await fetcher(url.href, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PASSWORD_MAILER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error('Password mailer rejected delivery')
}
