import { ReactNode, useState } from 'react';
import { Image, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { api, ApiError } from './api';
import CodeInput from './components/CodeInput';
import Ripple from './components/Ripple';
import Wordmark from './components/Wordmark';
import { color, font, radius, type } from './theme';
import { Button, Field, Notice, NoticeLine } from './ui';

type Step = 'credentials' | 'enroll' | 'backup' | 'verify';

type LoginRes = { pre_auth_token: string; next_step: 'VERIFY_2FA' | 'ENROLL_2FA' };
type EnrollRes = { secret: string; qr_png: string; backup_codes: string[] };
type VerifyRes = { access_token: string };
type VaultRes = { claims: { username: string } };

export type Session = { accessToken: string; username: string };

// Mensajes para la persona usuaria; el detalle técnico queda en los logs de Prefect.
function friendly(err: ApiError): string {
  switch (err.code) {
    case 'InvalidCredentials': return 'Usuario o contraseña incorrectos.';
    case 'UsernameTaken': return 'Ese usuario ya existe. Elige otro o inicia sesión.';
    case 'InvalidSecondFactor': return 'El código no es válido. Escribe el que muestra tu app en este momento.';
    case 'ReplayAttackDetected': return 'Ese código ya se usó. Espera a que tu app muestre uno nuevo.';
    case 'InvalidToken':
    case 'InsufficientScope':
    case 'MfaStateError': return 'La verificación expiró. Inicia sesión de nuevo.';
  }
  if (err.status === 0) return 'No hay conexión con el servidor. Revisa que el backend esté encendido.';
  if (err.status === 422) return 'El usuario necesita 3 caracteres o más y la contraseña 8 o más.';
  return 'Algo salió mal. Intenta de nuevo.';
}

const SESSION_ERRORS = new Set(['InvalidToken', 'InsufficientScope', 'MfaStateError']);

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (s: Session) => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [preAuth, setPreAuth] = useState('');
  const [enroll, setEnroll] = useState<EnrollRes | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (next: Notice | null = null) => {
    setStep('credentials');
    setPreAuth('');
    setEnroll(null);
    setCode('');
    setUseBackup(false);
    setNotice(next);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      const err = e as ApiError;
      setCode('');
      if (err.code && SESSION_ERRORS.has(err.code)) reset({ kind: 'error', text: friendly(err) });
      else setNotice({ kind: 'error', text: friendly(err) });
    } finally {
      setBusy(false);
    }
  };

  const login = async (hint?: Notice) => {
    const r = await api<LoginRes>('/auth/login', { body: { username, password } });
    setPreAuth(r.pre_auth_token);
    setCode('');
    if (r.next_step === 'ENROLL_2FA') {
      setEnroll(await api<EnrollRes>('/2fa/enroll', { token: r.pre_auth_token }));
      setShowSecret(false);
      setStep('enroll');
    } else {
      setStep('verify');
      if (hint) setNotice(hint);
    }
  };

  const submitCredentials = () => run(async () => {
    if (mode === 'register') await api('/auth/register', { body: { username, password } });
    await login();
  });

  const activate = (value: string) => run(async () => {
    await api('/2fa/activate', { token: preAuth, body: { code: value } });
    setCode('');
    setStep('backup');
  });

  const verify = (value: string) => run(async () => {
    const r = await api<VerifyRes>('/auth/verify-2fa', { token: preAuth, body: { code: value, method: useBackup ? 'backup' : 'totp' } });
    // La sesión solo se abre si la ruta protegida acepta el access_token (mfa_verified=true).
    const vault = await api<VaultRes>('/api/boveda-secreta', { method: 'GET', token: r.access_token });
    onAuthenticated({ accessToken: r.access_token, username: vault.claims.username });
  });

  const continueAfterBackup = () => run(() => login({ kind: 'info', text: 'Verificación activada. Escribe el siguiente código que muestre tu app.' }));

  const canSubmit = username.trim().length >= 3 && password.length >= 8;

  const form = (
        <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 28 }}>
          {step === 'credentials' && (
            <>
              <Text style={[type.title, { color: color.ink }]}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
              <View style={{ gap: 20 }}>
                <Field label="Usuario" value={username} onChangeText={setUsername} autoComplete="username" />
                <Field
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  onSubmitEditing={() => canSubmit && submitCredentials()}
                />
              </View>
              <NoticeLine notice={notice} />
              <View style={{ gap: 12 }}>
                <Button title={mode === 'login' ? 'Continuar' : 'Crear cuenta'} onPress={submitCredentials} loading={busy} disabled={!canSubmit} />
                <Button
                  variant="text"
                  title={mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Iniciar sesión'}
                  onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setNotice(null); }}
                />
              </View>
            </>
          )}

          {step === 'enroll' && enroll && (
            <>
              <View style={{ gap: 10 }}>
                <Text style={[type.title, { color: color.ink }]}>Protege tu cuenta</Text>
                <Text style={[type.body, { color: color.graphite }]}>Cada vez que entres te pediremos un código de tu app de autenticación.</Text>
              </View>
              <StepRow n={1} text="Escanea este código con Kawase Authenticator o Google Authenticator.">
                <View style={{ alignSelf: 'flex-start', padding: 10, backgroundColor: '#FFFFFF', borderRadius: radius }}>
                  <Image source={{ uri: enroll.qr_png }} style={{ width: 176, height: 176 }} accessibilityLabel="Código QR de configuración" />
                </View>
                {showSecret ? (
                  <Text selectable style={[type.figure, { color: color.ink, letterSpacing: 1 }]}>{enroll.secret.match(/.{1,4}/g)?.join(' ')}</Text>
                ) : (
                  <Button variant="text" title="¿No puedes escanear? Ver la clave" onPress={() => setShowSecret(true)} />
                )}
              </StepRow>
              <StepRow n={2} text="Escribe el código de 6 dígitos que aparece en la app.">
                <CodeInput value={code} onChange={setCode} onComplete={activate} />
              </StepRow>
              <NoticeLine notice={notice} />
              <Button title="Activar verificación" onPress={() => activate(code)} loading={busy} disabled={code.length !== 6} />
              <Button variant="text" title="Cancelar" onPress={() => reset()} />
            </>
          )}

          {step === 'backup' && enroll && (
            <>
              <View style={{ gap: 10 }}>
                <Text style={[type.title, { color: color.ink }]}>Guarda tus códigos de respaldo</Text>
                <Text style={[type.body, { color: color.graphite }]}>Si pierdes tu teléfono, cada uno de estos códigos te deja entrar una sola vez.</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: color.ink }}>
                {enroll.backup_codes.map((c) => (
                  <Text key={c} selectable style={[type.figure, { width: '50%', paddingVertical: 12, color: color.ink, fontSize: 17, letterSpacing: 1.5, borderBottomWidth: 1, borderColor: color.stone }]}>
                    {c}
                  </Text>
                ))}
              </View>
              <NoticeLine notice={notice} />
              <Button title="Ya los guardé" onPress={continueAfterBackup} loading={busy} />
            </>
          )}

          {step === 'verify' && (
            <>
              <View style={{ gap: 10 }}>
                <Text style={[type.title, { color: color.ink }]}>Verificación en dos pasos</Text>
                <Text style={[type.body, { color: color.graphite }]}>
                  {useBackup ? 'Escribe uno de tus códigos de respaldo.' : 'Escribe el código de 6 dígitos de tu app de autenticación.'}
                </Text>
              </View>
              {useBackup ? (
                <Field label="Código de respaldo" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="XXXX-XXXX" onSubmitEditing={() => verify(code)} />
              ) : (
                <CodeInput value={code} onChange={setCode} onComplete={verify} />
              )}
              <NoticeLine notice={notice} />
              <View style={{ gap: 12 }}>
                <Button title="Verificar" onPress={() => verify(code)} loading={busy} disabled={useBackup ? code.replace(/[\s-]/g, '').length !== 8 : code.length !== 6} />
                <Button
                  variant="text"
                  title={useBackup ? 'Usar la app de autenticación' : 'Usar un código de respaldo'}
                  onPress={() => { setUseBackup(!useBackup); setCode(''); setNotice(null); }}
                />
                <Button variant="text" title="Volver" onPress={() => reset()} />
              </View>
            </>
          )}
        </View>
  );

  // En escritorio el panel negro queda fijo y solo se desplaza el formulario.
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Hero wide />
        <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 64 }} keyboardShouldPersistTaps="handled">
          {form}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: color.paper }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <Hero wide={false} />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 32 }}>{form}</View>
    </ScrollView>
  );
}

function Hero({ wide }: { wide: boolean }) {
  const { width } = useWindowDimensions();
  const rippleWidth = wide ? Math.min(width * 0.42, 560) : width - 40;
  return (
    <View style={{ flex: wide ? 1.05 : undefined, backgroundColor: color.ink, padding: wide ? 56 : 20, paddingTop: wide ? 48 : 24, justifyContent: 'space-between', gap: wide ? 0 : 28 }}>
      <Wordmark />
      <Ripple width={rippleWidth} height={wide ? rippleWidth * 0.62 : 140} rings={wide ? 11 : 9} />
      <Text style={{ fontFamily: font.light, fontSize: wide ? 44 : 30, lineHeight: wide ? 48 : 34, letterSpacing: wide ? -1.4 : -0.8, color: color.paper, maxWidth: 520 }}>
        Pesos, dólares, euros y yenes en una sola cuenta.
      </Text>
    </View>
  );
}

function StepRow({ n, text, children }: { n: number; text: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <Text style={{ fontFamily: font.light, fontSize: 28, lineHeight: 30, color: color.red, width: 18 }}>{n}</Text>
      <View style={{ flex: 1, gap: 14 }}>
        <Text style={[type.body, { color: color.ink }]}>{text}</Text>
        {children}
      </View>
    </View>
  );
}
