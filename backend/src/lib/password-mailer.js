export async function sendPasswordReset(env, message, fetcher = fetch) {
  const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'FRS Coach', email: env.EMAIL_FROM },
      to: [{ email: message.to }],
      subject: 'Redefina sua senha · FRS Coach',
      textContent: `Acesse ${message.link} para redefinir sua senha. O link vale por 30 minutos. Se você não solicitou, ignore esta mensagem.`,
    }),
  })
  if (!response.ok) throw new Error(`Brevo rejected password reset email: ${response.status}`)
}
