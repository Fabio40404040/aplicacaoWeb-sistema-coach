export async function sendPasswordReset(env, message) {
  await env.EMAIL.send({
    to: message.to,
    from: { email: env.EMAIL_FROM, name: 'FRS Coach' },
    subject: 'Redefina sua senha · FRS Coach',
    text: `Acesse ${message.link} para redefinir sua senha. O link vale por 30 minutos. Se você não solicitou, ignore esta mensagem.`,
  })
}
