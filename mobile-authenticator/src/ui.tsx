import { ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';

import { color, font, radius, type } from './theme';

type Tone = 'dark' | 'light'; // dark = texto negro sobre blanco hueso; light = texto claro sobre negro

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'text';
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ title, onPress, variant = 'solid', tone = 'dark', disabled, loading }: ButtonProps) {
  const fg = tone === 'dark' ? color.ink : color.paper;
  const bg = tone === 'dark' ? color.ink : color.paper;
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        { borderRadius: radius, paddingVertical: variant === 'text' ? 8 : 15, paddingHorizontal: variant === 'text' ? 0 : 20, alignItems: 'center' },
        solid && { backgroundColor: bg },
        variant === 'outline' && { borderWidth: 1, borderColor: fg },
        variant === 'text' && { alignItems: 'flex-start' },
        (pressed || disabled) && { opacity: 0.45 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? (tone === 'dark' ? color.paper : color.ink) : fg} />
      ) : (
        <Text style={{ fontFamily: font.medium, fontSize: 15, color: solid ? (tone === 'dark' ? color.paper : color.ink) : fg }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, tone = 'dark', style, ...props }: TextInputProps & { label: string; tone?: Tone }) {
  const [focused, setFocused] = useState(false);
  const fg = tone === 'dark' ? color.ink : color.paper;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, { color: color.ash }]}>{label}</Text>
      <TextInput
        placeholderTextColor={color.stone}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          { fontFamily: font.regular, fontSize: 18, color: fg, paddingVertical: 10, borderBottomWidth: focused ? 1.5 : 1, outlineStyle: 'none' } as object,
          { borderColor: focused ? color.red : tone === 'dark' ? color.stone : color.graphite },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export type Notice = { kind: 'error' | 'info'; text: string };

export function NoticeLine({ notice, tone = 'dark' }: { notice: Notice | null; tone?: Tone }) {
  if (!notice) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 2, backgroundColor: notice.kind === 'error' ? color.red : color.ash }} />
      <Text style={[type.small, { flex: 1, color: tone === 'dark' ? color.ink : color.paper }]}>{notice.text}</Text>
    </View>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderBottomWidth: 1, borderColor: color.ink, paddingBottom: 10 }}>
        <Text style={[type.heading, { color: color.ink }]}>{title}</Text>
        {aside}
      </View>
      {children}
    </View>
  );
}
