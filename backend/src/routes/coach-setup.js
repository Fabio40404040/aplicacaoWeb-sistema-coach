import { readJson } from '../lib/http.js'
import { createSession, hashPassword, isStrongPassword } from '../lib/session.js'

async function validSetupToken(request, env) {
  const supplied = request.headers.get('X-Setup-Token')
  const expected = env.ADMIN_SETUP_TOKEN
  if (typeof supplied !== 'string' || typeof expected !== 'string' || expected.length < 32)
    return false
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all(
    [supplied, expected].map((value) =>
      crypto.subtle.digest('SHA-256', encoder.encode(value)).then((hash) => new Uint8Array(hash)),
    ),
  )
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export async function coachSetupAvailability(db) {
  const existing = await db.query('SELECT id FROM trainers LIMIT 1')
  return { data: { available: existing.rows.length === 0 } }
}

export async function coachSetup(request, env, db) {
  if (!env.ADMIN_SETUP_TOKEN)
    return { error: 'A ativação do painel ainda não foi configurada.', status: 503 }
  if (!(await validSetupToken(request, env)))
    return { error: 'Este link de ativação é inválido.', status: 404 }

  const existing = await db.query('SELECT id FROM trainers LIMIT 1')
  if (existing.rows.length)
    return {
      data: { available: false, message: 'Este painel já foi ativado pelo proprietário.' },
    }
  if (request.method === 'GET') return { data: { available: true } }

  const { name, email, password } = await readJson(request)
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 120)
    return { error: 'Informe seu nome completo.', status: 400 }
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())
  )
    return { error: 'Informe um e-mail válido.', status: 400 }
  if (!isStrongPassword(password))
    return {
      error:
        'A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
      status: 400,
    }

  const result = await db.query(
    `INSERT INTO trainers (name, email, password_hash)
    SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM trainers)
    RETURNING id, name, email`,
    [name.trim(), email.trim().toLowerCase(), await hashPassword(password)],
  )
  const trainer = result.rows[0]
  if (!trainer) return { error: 'Este painel já foi ativado pelo proprietário.', status: 409 }
  return {
    data: {
      token: await createSession(trainer, env),
      user: trainer,
      message: 'Painel ativado. Esta página de cadastro foi desativada.',
    },
    status: 201,
  }
}
