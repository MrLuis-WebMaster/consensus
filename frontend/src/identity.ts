const identityApi = import.meta.env.VITE_IDENTITY_API_URL ?? 'http://localhost:8088';

export type UserRole = 'participante' | 'administrador' | 'auditor';

export type AuthenticatedSession = {
  subject_id: string;
  masked_email: string;
  display_name: string;
  role: UserRole;
  territory_code: string;
  department_code: string;
  eligible: boolean;
  verification_method: string;
  expires_in_seconds: number;
  connection_mode: 'django_api' | 'local_sandbox_offline';
};

export type LoginStep1Response = {
  challenge_id: string;
  masked_email: string;
  step: string;
  otp_expires_in_seconds: number;
  resend_cooldown_seconds: number;
  message: string;
  sandbox_otp_preview?: string;
  connection_mode: 'django_api' | 'local_sandbox_offline';
};

// Ephemeral in-memory state ONLY (never persisted to localStorage or sessionStorage)
let offlineSandboxChallenge: {
  challengeId: string;
  email: string;
  maskedEmail: string;
  otpCode: string;
  expiresAt: number;
  resendAvailableAt: number;
  attempts: number;
  otpVerified: boolean;
  consentGranted: boolean;
  biometricOrFallbackVerified: boolean;
  verificationMethod: string;
} | null = null;

function maskEmailClient(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain[0]}***.${domain.split('.').slice(1).join('.')}`;
}

export async function verifyAdminTotp(token: string, code: string): Promise<void> {
  if (!token.trim()) throw new Error('Ingresa el token de administración de laboratorio.');
  if (!/^\d{6}$/.test(code)) throw new Error('El OTP debe tener seis dígitos.');
  const response = await fetch(`${identityApi}/v1/admin/totp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      result.error === 'totp_not_configured'
        ? 'Configura TOTP_SECRET y ADMIN_API_TOKEN en el .env local.'
        : 'El segundo factor no fue aceptado. Revisa token y OTP.',
    );
  }
}

export async function startLoginStep1(
  rawEmail: string,
  recaptchaToken: string,
): Promise<LoginStep1Response> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email)) {
    throw new Error('Ingresa un correo electrónico con formato válido.');
  }
  if (
    !recaptchaToken.trim() ||
    recaptchaToken.trim().toLowerCase().startsWith('invalid')
  ) {
    throw new Error('Validación reCAPTCHA rechazada. Completa la verificación contra automatización.');
  }

  try {
    const response = await fetch(`${identityApi}/v1/auth/login/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, recaptcha_token: recaptchaToken }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error === 'recaptcha_verification_failed'
          ? `Token reCAPTCHA rechazado en servidor (${data.reason ?? 'inválido'}).`
          : data.error === 'rate_limit_exceeded'
            ? 'Límite de intentos excedido. Espera unos minutos antes de reintentar.'
            : 'No fue posible iniciar el proceso de autenticación.',
      );
    }
    return { ...data, connection_mode: 'django_api' };
  } catch (err) {
    if (err instanceof Error && (err.message.includes('reCAPTCHA') || err.message.includes('Límite'))) {
      throw err;
    }
    if (recaptchaToken !== 'test-recaptcha-pass-consensus') {
      throw new Error('Token reCAPTCHA rechazado en validación de seguridad.');
    }
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otpCode = String(array[0] % 1000000).padStart(6, '0');
    const challengeId = `local_${crypto.randomUUID()}`;
    const now = Date.now();
    offlineSandboxChallenge = {
      challengeId,
      email,
      maskedEmail: maskEmailClient(email),
      otpCode,
      expiresAt: now + 300_000,
      resendAvailableAt: now + 60_000,
      attempts: 0,
      otpVerified: false,
      consentGranted: false,
      biometricOrFallbackVerified: false,
      verificationMethod: '',
    };
    return {
      challenge_id: challengeId,
      masked_email: offlineSandboxChallenge.maskedEmail,
      step: 'otp_pending',
      otp_expires_in_seconds: 300,
      resend_cooldown_seconds: 60,
      message:
        'Servicio Django desconectado: ejecutando en modo sandbox local de pruebas con CSPRNG WebCrypto.',
      sandbox_otp_preview: otpCode,
      connection_mode: 'local_sandbox_offline',
    };
  }
}

export async function verifyOtpStep2(
  challengeId: string,
  otpCode: string,
): Promise<{ step: string }> {
  const cleaned = otpCode.trim();
  if (!/^\d{6}$/.test(cleaned)) {
    throw new Error('El código OTP debe contener exactamente 6 dígitos numéricos.');
  }

  if (challengeId.startsWith('local_') && offlineSandboxChallenge) {
    if (Date.now() > offlineSandboxChallenge.expiresAt) {
      throw new Error('El código OTP ha expirado (límite 5 minutos). Solicita uno nuevo.');
    }
    if (offlineSandboxChallenge.attempts >= 3) {
      throw new Error('Límite máximo de 3 intentos OTP superado. Código invalidado.');
    }
    offlineSandboxChallenge.attempts += 1;
    if (cleaned !== offlineSandboxChallenge.otpCode) {
      const rem = Math.max(0, 3 - offlineSandboxChallenge.attempts);
      throw new Error(`Código OTP incorrecto. Intentos restantes: ${rem}.`);
    }
    offlineSandboxChallenge.otpVerified = true;
    offlineSandboxChallenge.otpCode = '';
    return { step: 'otp_verified' };
  }

  const response = await fetch(`${identityApi}/v1/auth/otp/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, otp_code: cleaned }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.error === 'otp_expired'
        ? 'El código OTP ha vencido. Solicita un nuevo código.'
        : data.error === 'otp_max_attempts_exceeded'
          ? 'Se superó el límite de intentos permitidos. El código fue invalidado.'
          : `Código OTP inválido. Intentos restantes: ${data.remaining_attempts ?? 0}.`,
    );
  }
  return data;
}

export async function grantBiometricConsentStep3(
  challengeId: string,
  accepted: boolean,
): Promise<void> {
  if (!accepted) {
    throw new Error('Debes aceptar el consentimiento informado o elegir el método alternativo autorizado.');
  }
  if (challengeId.startsWith('local_') && offlineSandboxChallenge) {
    if (!offlineSandboxChallenge.otpVerified) {
      throw new Error('Completa primero la verificación OTP por correo.');
    }
    offlineSandboxChallenge.consentGranted = true;
    return;
  }
  const response = await fetch(`${identityApi}/v1/auth/biometric/consent`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, accepted }),
  });
  if (!response.ok) {
    throw new Error('No fue posible registrar el consentimiento informado.');
  }
}

export async function revokeBiometricConsentStep3(challengeId: string): Promise<void> {
  if (challengeId.startsWith('local_') && offlineSandboxChallenge) {
    offlineSandboxChallenge.consentGranted = false;
    offlineSandboxChallenge.biometricOrFallbackVerified = false;
    return;
  }
  await fetch(`${identityApi}/v1/auth/biometric/revoke`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  }).catch(() => undefined);
}

export async function verifyFacialStep3(
  challengeId: string,
): Promise<{
  verified: boolean;
  engine_enabled: boolean;
  simulated: boolean;
  message: string;
}> {
  if (challengeId.startsWith('local_')) {
    return {
      verified: false,
      engine_enabled: false,
      simulated: false,
      message:
        'Motor FacePlugin SDK no instalado en este entorno. Nunca se simula una coincidencia facial real; utiliza el método alternativo autorizado.',
    };
  }
  const response = await fetch(`${identityApi}/v1/auth/biometric/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      challenge_id: challengeId,
      operation_mode: '1:1',
      probe_image_b64: '',
      reference_image_b64: '',
    }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    verified: Boolean(data.verified),
    engine_enabled: Boolean(data.engine_enabled),
    simulated: false,
    message:
      data.message ||
      'Motor FacePlugin SDK deshabilitado. Nunca se devuelve una coincidencia ficticia como real.',
  };
}

export async function verifyFallbackStep3(
  challengeId: string,
  fallbackCode: string,
  reason = 'camera_or_faceplugin_unavailable',
): Promise<void> {
  const cleaned = fallbackCode.trim();
  if (!cleaned) {
    throw new Error('Ingresa el código de contingencia autorizado (ej. ALT-CONSENSUS-2026).');
  }
  if (challengeId.startsWith('local_') && offlineSandboxChallenge) {
    if (!offlineSandboxChallenge.otpVerified) {
      throw new Error('Verifica primero el código OTP.');
    }
    if (cleaned !== 'ALT-CONSENSUS-2026') {
      throw new Error('Código de contingencia alternativo inválido.');
    }
    offlineSandboxChallenge.biometricOrFallbackVerified = true;
    offlineSandboxChallenge.verificationMethod = 'authorized_fallback';
    return;
  }

  const response = await fetch(`${identityApi}/v1/auth/biometric/fallback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      challenge_id: challengeId,
      fallback_code: cleaned,
      reason,
    }),
  });
  if (!response.ok) {
    throw new Error('El código de método alternativo no es válido.');
  }
}

export async function issueSessionStep4(
  challengeId: string,
): Promise<AuthenticatedSession> {
  if (challengeId.startsWith('local_') && offlineSandboxChallenge) {
    if (!offlineSandboxChallenge.otpVerified || !offlineSandboxChallenge.biometricOrFallbackVerified) {
      throw new Error('Debes completar los pasos 1, 2 y 3 antes de emitir la sesión.');
    }
    const email = offlineSandboxChallenge.email;
    const role: UserRole = email.startsWith('admin')
      ? 'administrador'
      : email.startsWith('auditor')
        ? 'auditor'
        : 'participante';
    const session: AuthenticatedSession = {
      subject_id: `sub_${challengeId.slice(-12)}`,
      masked_email: offlineSandboxChallenge.maskedEmail,
      display_name:
        role === 'administrador'
          ? 'Coordinación Electoral Sintética (Perfil 01/08)'
          : role === 'auditor'
            ? 'Auditoría Independiente Sintética (Perfil 06/08)'
            : 'Participante Sintético de Laboratorio',
      role,
      territory_code: role === 'auditor' ? '11001' : '05001',
      department_code: role === 'auditor' ? '11' : '05',
      eligible: role !== 'auditor',
      verification_method: offlineSandboxChallenge.verificationMethod,
      expires_in_seconds: 1800,
      connection_mode: 'local_sandbox_offline',
    };
    offlineSandboxChallenge = null;
    return session;
  }

  const response = await fetch(`${identityApi}/v1/auth/session/issue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('No se pudo emitir la sesión: verifica haber completado todos los factores.');
  }
  return { ...data.session, connection_mode: 'django_api' };
}

export async function logoutSession(): Promise<void> {
  offlineSandboxChallenge = null;
  await fetch(`${identityApi}/v1/auth/session/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined);
}
