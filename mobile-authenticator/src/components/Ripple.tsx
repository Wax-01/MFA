import Svg, { Ellipse } from 'react-native-svg';

import { color } from '../theme';

type Props = { width: number; height: number; rings?: number; stroke?: string; strokeWidth?: number };

/** Elipses que crecen hacia la derecha: el motivo de marca (expansión, conexión, crecimiento). */
export default function Ripple({ width, height, rings = 10, stroke = color.red, strokeWidth = 1.5 }: Props) {
  const cy = height / 2;
  const maxRy = height / 2 - strokeWidth;
  const ellipses = Array.from({ length: rings }, (_, i) => {
    const t = i / (rings - 1);
    const ry = maxRy * (0.22 + 0.78 * t);
    const rx = ry * (0.09 + 0.09 * t * t);
    const cx = width * 0.04 + (width * 0.9 - rx) * t ** 1.35;
    return { cx, ry, rx };
  });
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {ellipses.map((e, i) => (
        <Ellipse key={i} cx={e.cx} cy={cy} rx={e.rx} ry={e.ry} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      ))}
    </Svg>
  );
}
