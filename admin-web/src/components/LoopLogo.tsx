/** Monogramme officiel THE LOOP (cercle + arc + point). */
export function LoopLogo({
  variant = 'light',
  size = 28,
  className,
}: {
  variant?: 'light' | 'dark';
  size?: number;
  className?: string;
}) {
  const stroke = variant === 'light' ? '#FFFFFF' : '#000000';
  const fill = stroke;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="26" cy="26" r="22" stroke={stroke} strokeWidth="3.5" fill="none" />
      <path
        d="M 19.5 14.74 A 13 13 0 1 1 19.5 37.26"
        stroke={stroke}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14" cy="26" r="3" fill={fill} />
    </svg>
  );
}
