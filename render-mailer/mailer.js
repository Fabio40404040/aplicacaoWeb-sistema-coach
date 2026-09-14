import { timingSafeEqual } from 'node:crypto'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function authorized(header, token) {
  const supplied = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '')
  const expected = Buffer.from(token || '')
  return (
    expected.length >= 32 &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  )
}

export function validMessage(message, siteOrigin) {
  if (
    typeof message?.to !== 'string' ||
    message.to.length > 180 ||
    !emailPattern.test(message.to) ||
    typeof message.link !== 'string'
  )
    return false

  try {
    const link = new URL(message.link)
    const site = new URL(siteOrigin)
    const hash = link.hash.slice(1)
    const localSite = ['localhost', '127.0.0.1'].includes(site.hostname)
    if (
      (link.protocol !== 'https:' && !(localSite && link.protocol === 'http:')) ||
      link.origin !== site.origin ||
      !hash.startsWith('nova-senha?')
    )
      return false
    const parameters = new URLSearchParams(hash.slice('nova-senha?'.length))
    return (
      parameters.getAll('token').length === 1 && /^[a-f0-9]{64}$/u.test(parameters.get('token'))
    )
  } catch {
    return false
  }
}

export async function sendViaResend(message, config, fetcher = fetch) {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.MAIL_FROM,
      to: [message.to],
      subject: 'Redefina sua senha · FRS Coach',
      text: `Acesse ${message.link} para redefinir sua senha. O link vale por 30 minutos. Se você não solicitou, ignore esta mensagem.`,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
}
