const identityApi = import.meta.env.VITE_IDENTITY_API_URL ?? 'http://localhost:8088';

export async function verifyAdminTotp(token: string, code: string): Promise<void> {
  if (!token.trim()) throw new Error('Ingresa el token de administración de laboratorio.');
  if (!/^\d{6}$/.test(code)) throw new Error('El OTP debe tener seis dígitos.');
  const response = await fetch(`${identityApi}/v1/admin/totp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error === 'totp_not_configured'
      ? 'Configura TOTP_SECRET y ADMIN_API_TOKEN en el .env local.'
      : 'El segundo factor no fue aceptado. Revisa token y OTP.');
  }
}
