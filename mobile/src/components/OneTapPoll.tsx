import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import {
  getPollPhoneId,
  loadHomePollSnapshot,
  voteHomePoll,
  type HomePollSnapshot,
  type HomePollVoter,
} from '@/lib/home-poll-store';

interface OneTapPollProps {
  accent: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  background: string;
}

/** Vote one-tap : compte connecté ou id téléphone local (anonyme). */
export function OneTapPoll({
  accent,
  surface,
  border,
  text,
  muted,
  background,
}: OneTapPollProps) {
  const { user } = useAuthContext();
  const { activeCountryCode } = useContent();
  const [snap, setSnap] = useState<HomePollSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [phoneId, setPhoneId] = useState<string | null>(null);

  useEffect(() => {
    void getPollPhoneId().then(setPhoneId);
  }, []);

  const voter = useMemo((): HomePollVoter => {
    const userId = user && user.id !== 'anonymous' ? user.id : null;
    return {
      userId,
      phoneId: userId ? null : phoneId,
      profilePhone: user?.phoneNumber ?? null,
    };
  }, [user?.id, user?.phoneNumber, phoneId]);

  const refresh = useCallback(async () => {
    if (!voter.userId && !voter.phoneId) return;
    setLoading(true);
    try {
      setSnap(await loadHomePollSnapshot(voter, activeCountryCode));
    } finally {
      setLoading(false);
    }
  }, [voter, activeCountryCode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!voter.userId && !voter.phoneId) return;
      setLoading(true);
      try {
        const next = await loadHomePollSnapshot(voter, activeCountryCode);
        if (!cancelled) setSnap(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voter, activeCountryCode]);

  useEffect(() => {
    if (!snap?.poll.id) return;
    void import('@/lib/home-poll-store').then((m) => m.recordHomePollView(snap.poll.id));
  }, [snap?.poll.id]);

  async function onVote(optionId: string) {
    if (!snap || snap.userOptionId || voting) return;
    setVoting(true);
    try {
      const next = await voteHomePoll(snap.poll.id, optionId, voter, activeCountryCode);
      setSnap(next);
    } finally {
      setVoting(false);
    }
  }

  if (loading && !snap) {
    return (
      <View style={[styles.block, { backgroundColor: surface, borderColor: border }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!snap) return null;

  const frozen = Boolean(snap.userOptionId);

  return (
    <View style={[styles.block, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.kicker, { color: accent }]}>Mini-sondage</Text>
      <Text style={[styles.question, { color: text }]}>{snap.poll.question}</Text>

      <View style={styles.options}>
        {(snap.poll.options ?? []).map((opt) => {
          const selected = snap.userOptionId === opt.id;
          const pct =
            frozen && snap.total > 0
              ? Math.round(((snap.counts[opt.id] ?? 0) / snap.total) * 100)
              : 0;

          return (
            <Pressable
              key={opt.id}
              disabled={frozen || voting}
              onPress={() => void onVote(opt.id)}
              style={[
                styles.option,
                {
                  borderColor: selected ? accent : border,
                  backgroundColor: selected && !frozen ? accent : background,
                },
              ]}
            >
              {frozen ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.pctFill,
                    {
                      width: `${Math.max(pct, 6)}%`,
                      backgroundColor: accent,
                      opacity: selected ? 0.3 : 0.14,
                    },
                  ]}
                />
              ) : null}
              <View style={styles.optionInner}>
                <Text
                  style={[
                    styles.optionLabel,
                    {
                      color: selected && !frozen ? '#0a0a0a' : text,
                      fontWeight: selected ? '800' : '700',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {opt.label}
                </Text>
                {frozen ? (
                  <Text style={[styles.pctText, { color: text }]}>{pct} %</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {frozen ? (
        <Text style={[styles.thanks, { color: muted }]}>Merci pour votre réponse.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  kicker: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  question: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginBottom: 8,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  option: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '49%',
    borderWidth: 1.5,
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: 44,
    justifyContent: 'center',
  },
  pctFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  optionInner: {
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  optionLabel: { fontSize: 12, lineHeight: 16 },
  pctText: { fontSize: 12, fontWeight: '800' },
  thanks: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
  },
});
