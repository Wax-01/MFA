import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import Wordmark from './components/Wordmark';
import { loadAccounts, saveAccounts } from './storage';
import { base32Decode, OtpAccount, parseOtpAuthUri, totp } from './totp';
import { color, font, type } from './theme';
import { Button, Field, NoticeLine } from './ui';

type NewAccount = Omit<OtpAccount, 'id'>;

/** Segundo Unix actual; solo re-renderiza cuando cambia el segundo. */
function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function AuthenticatorScreen() {
  const [accounts, setAccounts] = useState<OtpAccount[]>([]);
  const [mode, setMode] = useState<'list' | 'scan' | 'manual'>('list');
  const now = useNowSeconds();

  useEffect(() => {
    loadAccounts().then(setAccounts);
  }, []);

  const persist = (next: OtpAccount[]) => {
    setAccounts(next);
    saveAccounts(next);
  };

  const add = (acc: NewAccount) => {
    persist([...accounts.filter((a) => a.secret !== acc.secret), { ...acc, id: String(Date.now()) }]);
    setMode('list');
  };

  if (mode === 'scan') return <Scanner onScanned={add} onCancel={() => setMode('list')} />;

  return (
    <ScrollView style={{ backgroundColor: color.ink }} contentContainerStyle={{ padding: 20, gap: 28 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 18 }}>
        <Wordmark />
        <Text style={[type.title, { color: color.paper }]}>Authenticator</Text>
      </View>

      {mode === 'manual' ? (
        <ManualEntry onAdd={add} onCancel={() => setMode('list')} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button tone="light" title="Escanear QR" onPress={() => setMode('scan')} /></View>
          <View style={{ flex: 1 }}><Button tone="light" variant="outline" title="Escribir clave" onPress={() => setMode('manual')} /></View>
        </View>
      )}

      {accounts.length === 0 && mode === 'list' && (
        <Text style={[type.body, { color: color.stone }]}>
          Escanea el código QR que muestra Kawase cuando activas la verificación en dos pasos. Los códigos se generan en este teléfono, incluso sin conexión.
        </Text>
      )}

      <View>
        {accounts.map((acc) => (
          <AccountRow key={acc.id} account={acc} now={now} onDelete={() => persist(accounts.filter((a) => a.id !== acc.id))} />
        ))}
      </View>
    </ScrollView>
  );
}

function AccountRow({ account, now, onDelete }: { account: OtpAccount; now: number; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { code, remaining } = totp(account.secret, now * 1000, account.period, account.digits);
  const urgent = remaining <= 5;
  const half = Math.ceil(code.length / 2);

  return (
    <View style={{ paddingVertical: 20, gap: 10, borderTopWidth: 1, borderColor: color.graphite }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[type.body, { color: color.stone, flexShrink: 1 }]}>
          <Text style={{ fontFamily: font.medium, color: color.paper }}>{account.issuer || 'Cuenta'}</Text>  {account.account}
        </Text>
        {confirming ? (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Text style={[type.small, { color: color.red }]} onPress={onDelete}>Eliminar</Text>
            <Text style={[type.small, { color: color.stone }]} onPress={() => setConfirming(false)}>Cancelar</Text>
          </View>
        ) : (
          <Text style={[type.small, { color: color.ash }]} onPress={() => setConfirming(true)}>Quitar</Text>
        )}
      </View>

      <Text selectable accessibilityLabel={`Código ${code.split('').join(' ')}`} style={[type.display, { color: urgent ? color.red : color.paper, fontSize: 60, lineHeight: 64, letterSpacing: 2 }]}>
        {code.slice(0, half)} {code.slice(half)}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 2, backgroundColor: color.graphite }}>
          <View style={{ height: 2, width: `${(remaining / account.period) * 100}%`, backgroundColor: urgent ? color.red : color.paper }} />
        </View>
        <Text style={[type.small, { color: color.stone, fontVariant: ['tabular-nums'], width: 28, textAlign: 'right' }]}>{remaining} s</Text>
      </View>
    </View>
  );
}

function ManualEntry({ onAdd, onCancel }: { onAdd: (acc: NewAccount) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    try {
      if (value.trim().toLowerCase().startsWith('otpauth://')) return onAdd(parseOtpAuthUri(value));
      const secret = value.toUpperCase().replace(/[\s=-]/g, '');
      base32Decode(secret);
      onAdd({ issuer: 'Kawase', account: name.trim() || 'Mi cuenta', secret, digits: 6, period: 30 });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={{ gap: 20 }}>
      <Field tone="light" label="Nombre de la cuenta" value={name} onChangeText={setName} />
      <Field tone="light" label="Clave de configuración" value={value} onChangeText={(t) => { setValue(t); setError(null); }} autoCapitalize="characters" />
      <NoticeLine tone="light" notice={error ? { kind: 'error', text: error } : null} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button tone="light" title="Guardar" onPress={submit} disabled={!value.trim()} /></View>
        <View style={{ flex: 1 }}><Button tone="light" variant="outline" title="Cancelar" onPress={onCancel} /></View>
      </View>
    </View>
  );
}

function Scanner({ onScanned, onCancel }: { onScanned: (acc: NewAccount) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) return <View style={{ flex: 1, backgroundColor: color.ink }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: color.ink, padding: 20, gap: 16, justifyContent: 'center' }}>
        <Text style={[type.body, { color: color.paper }]}>Kawase necesita la cámara para leer el código QR.</Text>
        <Button tone="light" title="Permitir cámara" onPress={requestPermission} />
        <Button tone="light" variant="outline" title="Volver" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          try {
            const acc = parseOtpAuthUri(data);
            handled.current = true;
            onScanned(acc);
          } catch {
            setError('Ese código QR no es de verificación en dos pasos.');
          }
        }}
      />
      <View style={{ padding: 20, gap: 14, backgroundColor: color.ink }}>
        <Text style={[type.body, { color: color.paper }]}>Apunta al código QR que muestra Kawase.</Text>
        <NoticeLine tone="light" notice={error ? { kind: 'error', text: error } : null} />
        <Button tone="light" variant="outline" title="Cancelar" onPress={onCancel} />
      </View>
    </View>
  );
}
