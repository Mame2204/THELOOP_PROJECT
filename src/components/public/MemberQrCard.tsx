import { QRCodeSVG } from 'qrcode.react';
import { formatDisplayName } from '@/lib/user-display';
import type { MemberGradeTheme } from '@/lib/member-grade-theme';

interface MemberQrCardProps {
  theme: MemberGradeTheme;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  qrCodeToken?: string | null;
}

export function MemberQrCard({
  theme,
  firstName,
  lastName,
  email,
  phoneNumber,
  qrCodeToken,
}: MemberQrCardProps) {
  const { card } = theme;
  const displayName = formatDisplayName(firstName, lastName) || 'Membre THE LOOP';
  const token = qrCodeToken?.trim() || 'theloop-pending';

  return (
    <div className={`grade-shimmer relative overflow-hidden rounded-2xl p-5 ${card.wrapper}`}>
      <div className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl ${card.glow}`} />
      <div className={`pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full blur-2xl opacity-50 ${card.glow}`} />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${card.brandText}`}>THE LOOP</p>
          <p className={`mt-1 text-xs uppercase tracking-wider ${card.subtitleText}`}>Carte membre officielle</p>

          <p className={`mt-4 truncate text-xl font-bold leading-tight ${card.nameText}`}>{displayName}</p>
          <p className={`mt-1 truncate text-xs ${card.emailText}`}>{email ?? '—'}</p>
          {phoneNumber && (
            <p className={`mt-0.5 text-xs ${card.emailText}`}>{phoneNumber}</p>
          )}

          <span
            className={`mt-4 inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${card.badge}`}
          >
            {theme.badgeLabel}
          </span>
        </div>

        <div className={`shrink-0 rounded-xl p-2.5 ${card.qrFrame}`}>
          <QRCodeSVG
            value={token}
            size={88}
            level="M"
            includeMargin={false}
            fgColor={card.qrFg}
            bgColor={card.qrBg}
          />
        </div>
      </div>

      <p className={`relative mt-4 text-center text-[9px] font-mono tracking-widest ${card.tokenText}`}>
        {token}
      </p>
    </div>
  );
}
