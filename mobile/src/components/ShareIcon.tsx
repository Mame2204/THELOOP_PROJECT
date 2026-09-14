import Svg, { Path, Rect } from 'react-native-svg';

interface ShareIconProps {
  size?: number;
  color?: string;
}

/** Icône style iOS (carré + flèche vers le haut). */
export function ShareIcon({ size = 20, color = '#000' }: ShareIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4v10M12 4l3.5 3.5M12 4L8.5 7.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke={color} strokeWidth={2} />
    </Svg>
  );
}
