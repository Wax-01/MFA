import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

type Props = { data: number[]; height: number; stroke: string; strokeWidth?: number; baseline?: string };

/** Línea simple que se adapta al ancho del contenedor. */
export default function LineChart({ data, height, stroke, strokeWidth = 1.5, baseline }: Props) {
  const [width, setWidth] = useState(0);
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const pad = strokeWidth;
  const d = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {baseline && <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={baseline} strokeWidth={1} />}
          <Path d={d} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}
