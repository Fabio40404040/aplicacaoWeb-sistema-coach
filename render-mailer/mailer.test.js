import assert from 'node:assert/strict'
import test from 'node:test'
import { authorized, sendViaResend, validMessage } from './mailer.js'

const token = 'a'.repeat(64)
const link = `https://frs.example/#nova-senha?token=${'b'.repeat(64)}`

test('only the Cloudflare secret can request delivery', () => {
  assert.equal(authorized(`Bearer ${token}`, token), true)
  assert.equal(authorized(`Bearer ${'c'.repeat(64)}`, token), false)
  assert.equal(authorized(undefined, token), false)
})

test('only a reset link for the configured site is accepted', () => {
  assert.equal(validMessage({ to: 'aluno@example.com', link }, 'https://frs.example'), true)
  assert.equal(
    validMessage(
      { to: 'aluno@example.com', link: link.replace('frs.example', 'other.example') },
      'https://frs.example',
    ),
    false,
  )
  assert.equal(
    validMessage({ to: 'aluno@example.com', link: 'https://frs.example/' }, 'https://frs.example'),
    false,
  )
  assert.equal(
    validMessage(
      {
        to: 'aluno@example.com',
        link: `http://localhost:5173/#nova-senha?token=${'b'.repeat(64)}`,
      },
      'http://localhost:5173',
    ),
    true,
  )
  assert.equal(validMessage({ to: 'invalid', link }, 'https://frs.example'), false)
})

test('Render submits the recovery email to Resend over HTTPS', async () => {
  const config = { RESEND_API_KEY: 'test-key', MAIL_FROM: 'FRS <contato@frs.example>' }
  await sendViaResend({ to: 'aluno@example.com', link }, config, async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.equal(options.headers.Authorization, 'Bearer test-key')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.to, ['aluno@example.com'])
    assert.match(body.text, /nova-senha\?token=/u)
    return new Response(JSON.stringify({ id: 'accepted' }), { status: 200 })
  })
})
