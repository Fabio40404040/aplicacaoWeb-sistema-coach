import { readJson } from '../lib/http.js'
import { sendPasswordReset } from '../lib/password-mailer.js'
import { hashPassword, isStrongPassword } from '../lib/session.js'

const generic = {
  data: {
    message:
      'Se houver uma conta com esse e-mail, você receberá um link de recuperação. Confira também o spam.',
  },
}
const hex = (bytes) => Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')
const digest = async (text) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

export async function studentRecovery(request, env, db, action, deliver = sendPasswordReset) {
  const body = await readJson(request)
  if (action === 'reset') {
    const { token, password } = body || {}
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token) || !isStrongPassword(password))
      return {
        error:
          'Use um link válido e uma senha com maiúscula, minúscula, número e caractere especial.',
        status: 400,
      }
    const hashed = await hashPassword(password)
    const tokenHash = await digest(token)
    const [result] = await db.batch([
      {
        sql: `UPDATE student_accounts SET password_hash = $2, auth_version = auth_version + 1
        WHERE id IN (SELECT account_id FROM student_password_resets WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP) RETURNING id`,
        values: [tokenHash, hashed],
      },
      { sql: 'DELETE FROM student_password_resets WHERE token_hash = $1', values: [tokenHash] },
    ])
    if (!result.rows.length)
      return { error: 'Este link expirou ou já foi usado. Solicite outro.', status: 400 }
    return { data: { message: 'Senha alterada. Você já pode entrar com a nova senha.' } }
  }
  const email = body?.email
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())
  )
    return { error: 'Informe um e-mail válido.', status: 400 }
  if (!env.EMAIL?.send || !env.EMAIL_FROM || !env.PUBLIC_SITE_URL)
    return {
      error:
        'A recuperação por e-mail ainda não está disponível. Entre em contato com o treinador.',
      status: 503,
    }
  const result = await db.query(
    'SELECT id, email FROM student_accounts WHERE lower(email) = lower($1) LIMIT 1',
    [email.trim()],
  )
  const account = result.rows[0]
  if (!account) return generic
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await digest(token)
  const inserted = await db.query(
    `INSERT INTO student_password_resets (account_id, token_hash, expires_at)
    VALUES ($1, $2, datetime('now', '+30 minutes'))
    ON CONFLICT (account_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, requested_at = CURRENT_TIMESTAMP
    WHERE student_password_resets.requested_at < datetime('now', '-2 minutes') RETURNING account_id`,
    [account.id, tokenHash],
  )
  if (!inserted.rows.length) return generic
  const link = new URL(env.PUBLIC_SITE_URL)
  link.hash = `nova-senha?token=${token}`
  try {
    await deliver(env, { to: account.email, link: link.href })
  } catch {
    await db.query(
      'DELETE FROM student_password_resets WHERE account_id = $1 AND token_hash = $2',
      [account.id, tokenHash],
    )
    return {
      error: 'Não foi possível enviar a recuperação agora. Tente novamente mais tarde.',
      status: 503,
    }
  }
  return generic
}
