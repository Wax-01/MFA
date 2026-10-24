import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import type { Session } from './AuthScreen';
import LineChart from './components/LineChart';
import Ripple from './components/Ripple';
import Wordmark from './components/Wordmark';
import {
  changeLabel, Currency, CURRENCIES, CURRENCY_NAMES, HOLDINGS, money, MOVEMENTS, number, PAIRS, Period, PERIODS,
  portfolioSeries, RATES, series, totalUsd, WALLETS,
} from './mockData';
import { color, font, radius, type } from './theme';
import { Section } from './ui';

const ACTIONS = ['Convertir', 'Enviar', 'Invertir', 'Recargar'];
const ALLOCATION_SHADES = [color.ink, color.graphite, color.ash, color.stone];

export default function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const gutter = wide ? 48 : 20;

  const [currency, setCurrency] = useState<Currency>('USD');
  const [period, setPeriod] = useState<Period>('1M');

  const data = portfolioSeries(period);
  const growth = ((data[data.length - 1] - data[0]) / data[0]) * 100;
  const total = totalUsd() * RATES[currency];
  const balance = money(total, currency, false);
  // El saldo ocupa una sola línea: la fuente se reduce según el ancho disponible (≈0,58 em por cifra).
  const balanceSize = Math.min(wide ? 80 : 52, (width - gutter * 2) / (balance.length * 0.58));

  return (
    <ScrollView style={{ backgroundColor: color.paper }}>
      {/* Bloque negro: patrimonio, motivo de marca y acciones */}
      <View style={{ backgroundColor: color.ink, paddingHorizontal: gutter, paddingTop: 24, paddingBottom: 32 }}>
        <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: color.graphite, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.medium, fontSize: 13, color: color.paper }}>{session.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <Pressable onPress={onLogout} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Text style={[type.small, { color: color.stone }]}>Cerrar sesión</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 24 }}>
            <View style={{ flex: 1, gap: 18 }}>
              <Text style={[type.body, { color: color.stone }]}>Hola, {session.username}. Este es tu patrimonio total.</Text>
              <View style={{ flexDirection: 'row', gap: 20 }}>
                {CURRENCIES.map((c) => (
                  <Pressable key={c} onPress={() => setCurrency(c)} accessibilityRole="button" accessibilityState={{ selected: c === currency }}>
                    <Text style={[type.figure, { color: c === currency ? color.paper : color.ash, paddingBottom: 4, borderBottomWidth: 1.5, borderColor: c === currency ? color.red : 'transparent' }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text accessibilityLabel={money(total, currency)} style={[type.display, { color: color.paper, fontSize: balanceSize, lineHeight: balanceSize * 1.08 }]}>
                {balance}
              </Text>
              <Text style={[type.small, { color: color.stone }]}>
                {changeLabel(growth)} en {period === '1S' ? 'la última semana' : period === '1M' ? 'el último mes' : period === '6M' ? 'los últimos 6 meses' : 'el último año'}
              </Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Ripple width={wide ? Math.min((width - gutter * 2) / 2 - 24, 560) : width - gutter * 2} height={wide ? 210 : 120} rings={12} />
            </View>
          </View>

          <View style={{ gap: 14 }}>
            <LineChart data={data} height={wide ? 120 : 90} stroke={color.paper} strokeWidth={1.25} baseline={color.graphite} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <View style={{ flexDirection: 'row', gap: 18 }}>
                {PERIODS.map((p) => (
                  <Pressable key={p} onPress={() => setPeriod(p)} accessibilityRole="button" accessibilityState={{ selected: p === period }}>
                    <Text style={[type.small, { color: p === period ? color.paper : color.ash, fontFamily: p === period ? font.medium : font.regular }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', width: wide ? undefined : '100%' }}>
                {ACTIONS.map((a) => (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      borderWidth: 1, borderColor: color.graphite, borderRadius: radius, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center',
                      flexGrow: wide ? 0 : 1, flexBasis: wide ? 'auto' : '40%', opacity: pressed ? 0.5 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: font.medium, fontSize: 14, color: color.paper }}>{a}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Bloque blanco hueso: billeteras, cambio, inversiones y movimientos */}
      <View style={{ paddingHorizontal: gutter, paddingVertical: 40 }}>
        <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 40 }}>
          <View style={{ flex: 1, gap: 40 }}>
            <Section title="Billeteras" aside={<Text style={[type.small, { color: color.ash }]}>{WALLETS.length} divisas</Text>}>
              {WALLETS.map((w) => (
                <Row
                  key={w.currency}
                  lead={<CurrencyTag code={w.currency} />}
                  title={CURRENCY_NAMES[w.currency]}
                  subtitle={w.currency === 'USD' ? 'Moneda base' : `1 USD = ${number(RATES[w.currency], w.currency === 'EUR' ? 4 : 2)} ${w.currency}`}
                  value={money(w.balance, w.currency, false)}
                  note={w.currency === 'USD' ? undefined : changeLabel(w.change)}
                />
              ))}
            </Section>

            <Section title="Movimientos recientes">
              {MOVEMENTS.map((m) => (
                <Row key={m.title + m.date} title={m.title} subtitle={m.date} value={`${m.amount > 0 ? '+' : ''}${money(m.amount, m.currency)}`} />
              ))}
            </Section>
          </View>

          <View style={{ flex: 1, gap: 40 }}>
            <Section title="Tipos de cambio" aside={<Text style={[type.small, { color: color.ash }]}>Últimas 24 horas</Text>}>
              {PAIRS.map((p) => (
                <View key={p.pair} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.stone }}>
                  <Text style={[type.figure, { color: color.ink, width: 76 }]}>{p.pair}</Text>
                  <View style={{ flex: 1 }}>
                    <LineChart data={series(p.seed, 24, p.rate, 0.004)} height={28} stroke={color.ink} strokeWidth={1} />
                  </View>
                  <View style={{ alignItems: 'flex-end', width: 96 }}>
                    <Text style={[type.figure, { color: color.ink }]}>{number(p.rate, p.decimals)}</Text>
                    <Text style={[type.small, { color: color.ash }]}>{changeLabel(p.change)}</Text>
                  </View>
                </View>
              ))}
            </Section>

            <Section title="Inversiones" aside={<Text style={[type.figure, { color: color.ink }]}>{money(HOLDINGS.reduce((s, h) => s + h.valueUsd, 0), 'USD')}</Text>}>
              <Allocation />
              {HOLDINGS.map((h, i) => (
                <Row
                  key={h.name}
                  lead={<View style={{ width: 10, height: 10, backgroundColor: ALLOCATION_SHADES[i] }} />}
                  title={h.name}
                  subtitle={h.detail}
                  value={money(h.valueUsd, 'USD', false)}
                  note={changeLabel(h.change)}
                />
              ))}
            </Section>
          </View>
        </View>

        <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', marginTop: 56, paddingTop: 16, borderTopWidth: 1, borderColor: color.stone, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Wordmark tone="dark" size={14} />
          <Text style={[type.small, { color: color.ash }]}>Sesión protegida con verificación en dos pasos.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ lead, title, subtitle, value, note }: { lead?: ReactNode; title: string; subtitle?: string; value: string; note?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.stone }}>
      {lead}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: color.ink }]}>{title}</Text>
        {subtitle && <Text style={[type.small, { color: color.ash }]}>{subtitle}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[type.figure, { color: color.ink }]}>{value}</Text>
        {note && <Text style={[type.small, { color: color.ash }]}>{note}</Text>}
      </View>
    </View>
  );
}

function CurrencyTag({ code }: { code: Currency }) {
  return (
    <View style={{ width: 44, height: 32, borderWidth: 1, borderColor: color.ink, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.medium, fontSize: 12, color: color.ink }}>{code}</Text>
    </View>
  );
}

function Allocation() {
  const total = HOLDINGS.reduce((s, h) => s + h.valueUsd, 0);
  return (
    <View style={{ flexDirection: 'row', height: 10, gap: 2 }}>
      {HOLDINGS.map((h, i) => (
        <View key={h.name} style={{ flex: h.valueUsd / total, backgroundColor: ALLOCATION_SHADES[i] }} />
      ))}
    </View>
  );
}
