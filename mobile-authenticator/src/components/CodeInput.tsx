import { ComponentRef, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { color, font, radius } from '../theme';

type Props = { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; length?: number; tone?: 'light' | 'dark' };

/** Seis casillas sobre un único TextInput invisible: funciona igual en web, iOS y Android. */
export default function CodeInput({ value, onChange, onComplete, length = 6, tone = 'dark' }: Props) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const fg = tone === 'dark' ? color.ink : color.paper;

  return (
    <Pressable onPress={() => input.current?.focus()} style={{ position: 'relative' }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const active = i === value.length;
          return (
            <View
              key={i}
              style={{
                flex: 1, aspectRatio: 0.82, maxWidth: 56, borderRadius: radius, alignItems: 'center', justifyContent: 'center',
                borderWidth: active ? 1.5 : 1, borderColor: active ? color.red : tone === 'dark' ? color.stone : color.graphite,
              }}
            >
              <Text style={{ fontFamily: font.light, fontSize: 30, color: fg, fontVariant: ['tabular-nums'] }}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length}
        autoFocus
        caretHidden
        aria-label="Código de verificación"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent', borderWidth: 0, outlineStyle: 'none' } as object}
      />
    </Pressable>
  );
}
