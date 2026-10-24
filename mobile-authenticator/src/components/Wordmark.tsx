import { Text, View } from 'react-native';

import { color, font } from '../theme';
import Ripple from './Ripple';

export default function Wordmark({ tone = 'light', size = 20 }: { tone?: 'light' | 'dark'; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ripple width={size * 1.4} height={size} rings={5} strokeWidth={1.4} />
      <Text style={{ fontFamily: font.medium, fontSize: size, letterSpacing: -0.4, color: tone === 'light' ? color.paper : color.ink }}>
        Kawase
      </Text>
      <Text style={{ fontSize: size * 0.6, color: color.red }}>為替</Text>
    </View>
  );
}
