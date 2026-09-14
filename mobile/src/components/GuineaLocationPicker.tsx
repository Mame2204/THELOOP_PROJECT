import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatGuineaLocation,
  isGuineaCountry,
  listGuineaCommunes,
  listGuineaDistricts,
  listGuineaPrefectures,
  listGuineaRegions,
  searchGuineaLocations,
  type GuineaLocationEntry,
  type GuineaLocationPickMeta,
} from '@/lib/guinea-locations';
import type { ShellTheme } from '@/lib/member-grade-theme';

type Step = 'search' | 'region' | 'prefecture' | 'commune' | 'district';

interface Props {
  value: string;
  onChange: (value: string, meta?: GuineaLocationPickMeta) => void;
  shell: ShellTheme;
  label?: string;
  placeholder?: string;
  allowCommuneOnly?: boolean;
  countryCode?: string | null;
  /** Si false et pays GN, champ obligatoire visuellement */
  optional?: boolean;
  disabled?: boolean;
}

export function GuineaLocationPicker({
  value,
  onChange,
  shell,
  label = 'Localisation',
  placeholder = 'Choisir commune et quartier…',
  allowCommuneOnly = true,
  countryCode = 'GN',
  optional = true,
  disabled = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [commune, setCommune] = useState('');

  const usePicker = isGuineaCountry(countryCode);

  const searchResults = useMemo(() => searchGuineaLocations(query), [query]);

  function resetNav() {
    setStep('search');
    setQuery('');
    setRegion('');
    setPrefecture('');
    setCommune('');
  }

  function openPicker() {
    if (disabled) return;
    resetNav();
    const trimmed = value.trim();
    if (trimmed) {
      const sepIdx = trimmed.indexOf(' · ');
      const searchSeed =
        sepIdx >= 0 ? trimmed.slice(sepIdx + 3).trim() || trimmed.slice(0, sepIdx).trim() : trimmed;
      setQuery(searchSeed);
    }
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
  }

  function commitSelection(nextLabel: string, meta: GuineaLocationPickMeta) {
    onChange(nextLabel, meta);
    closePicker();
  }

  function selectSearch(entry: GuineaLocationEntry) {
    commitSelection(formatGuineaLocation(entry.commune, entry.district), {
      region: entry.region,
      prefecture: entry.prefecture,
      commune: entry.commune,
      district: entry.district,
    });
  }

  function selectCommuneOnly() {
    commitSelection(commune, {
      region,
      prefecture,
      commune,
      district: null,
    });
  }

  function selectDistrict(districtName: string) {
    commitSelection(formatGuineaLocation(commune, districtName), {
      region,
      prefecture,
      commune,
      district: districtName,
    });
  }

  if (!usePicker) {
    return (
      <View>
        {label ? <Text style={[styles.label, { color: shell.pageKicker }]}>{label}{optional ? '' : ' *'}</Text> : null}
        <TextInput
          style={[
            styles.field,
            {
              borderColor: shell.filterInactiveBorder,
              color: shell.pageTitle,
              backgroundColor: shell.filterInactiveBg,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
          value={value}
          onChangeText={(text) => onChange(text)}
          placeholder={placeholder}
          placeholderTextColor={shell.pageKicker}
          editable={!disabled}
        />
      </View>
    );
  }

  const regions = listGuineaRegions();
  const prefectures = region ? listGuineaPrefectures(region) : [];
  const communes = region && prefecture ? listGuineaCommunes(region, prefecture) : [];
  const districts = region && prefecture && commune ? listGuineaDistricts(region, prefecture, commune) : [];

  return (
    <View>
      {label ? <Text style={[styles.label, { color: shell.pageKicker }]}>{label}{optional ? ' (optionnel)' : ' *'}</Text> : null}
      <TouchableOpacity
        activeOpacity={0.75}
        style={[
          styles.field,
          {
            borderColor: value && !disabled ? shell.tabIndicator : shell.filterInactiveBorder,
            backgroundColor: shell.filterInactiveBg,
            borderWidth: value && !disabled ? 2 : 1,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label || 'Localisation'}
      >
        <Text style={{ color: value ? shell.pageTitle : shell.pageKicker, fontSize: 14 }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalRoot}>
          {/* Zone sombre cliquable — flex:1 uniquement AU-DESSUS de la feuille (pas de absoluteFill) */}
          <Pressable style={styles.backdrop} onPress={closePicker} accessibilityRole="button" />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: shell.pageBg,
                borderColor: shell.filterInactiveBorder,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: shell.filterInactiveBorder }]} />
            <Text style={[styles.title, { color: shell.pageTitle }]}>Localisation Guinée</Text>
            <Text style={[styles.subtitle, { color: shell.pageKicker }]}>
              Région → Préfecture → Commune → Quartier
            </Text>

            {step === 'search' ? (
              <>
                <TextInput
                  style={[
                    styles.search,
                    {
                      borderColor: shell.filterInactiveBorder,
                      color: shell.pageTitle,
                      backgroundColor: shell.filterInactiveBg,
                    },
                  ]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Rechercher un quartier…"
                  placeholderTextColor={shell.pageKicker}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <ScrollView
                  style={styles.list}
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {query.length >= 2
                    ? searchResults.map((entry) => (
                        <OptionRow
                          key={`${entry.commune}-${entry.district}`}
                          shell={shell}
                          title={formatGuineaLocation(entry.commune, entry.district)}
                          subtitle={`${entry.region} · ${entry.prefecture}`}
                          onPress={() => selectSearch(entry)}
                        />
                      ))
                    : (
                      <Text style={[styles.searchHint, { color: shell.pageKicker }]}>
                        Saisissez au moins 2 lettres ou parcourez par région.
                      </Text>
                    )}
                  <TouchableOpacity
                    style={[styles.navBtn, { borderColor: shell.filterInactiveBorder }]}
                    onPress={() => setStep('region')}
                    activeOpacity={0.75}
                  >
                    <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Parcourir par région →</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            ) : null}

            {step === 'region' ? (
              <OptionList
                items={regions}
                shell={shell}
                onPick={(picked) => {
                  setRegion(picked);
                  setStep('prefecture');
                }}
                onBack={() => setStep('search')}
              />
            ) : null}

            {step === 'prefecture' ? (
              <OptionList
                items={prefectures}
                shell={shell}
                onPick={(picked) => {
                  setPrefecture(picked);
                  setStep('commune');
                }}
                onBack={() => setStep('region')}
              />
            ) : null}

            {step === 'commune' ? (
              <OptionList
                items={communes}
                shell={shell}
                onPick={(picked) => {
                  setCommune(picked);
                  setStep('district');
                }}
                onBack={() => setStep('prefecture')}
              />
            ) : null}

            {step === 'district' ? (
              <>
                {allowCommuneOnly ? (
                  <TouchableOpacity
                    style={[styles.communeOnly, { borderColor: shell.filterInactiveBorder }]}
                    onPress={selectCommuneOnly}
                    activeOpacity={0.75}
                  >
                    <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 12 }}>
                      Toute la commune — {commune}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <OptionList
                  items={districts}
                  shell={shell}
                  onPick={selectDistrict}
                  onBack={() => setStep('commune')}
                />
              </>
            ) : null}

            <TouchableOpacity style={styles.close} onPress={closePicker} activeOpacity={0.75}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function OptionRow({
  shell,
  title,
  subtitle,
  onPress,
}: {
  shell: ShellTheme;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          borderColor: shell.filterInactiveBorder,
          backgroundColor: shell.filterInactiveBg,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 13 }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: shell.pageKicker, fontSize: 10, marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function OptionList({
  items,
  shell,
  onPick,
  onBack,
}: {
  items: string[];
  shell: ShellTheme;
  onPick: (item: string) => void;
  onBack: () => void;
}) {
  return (
    <>
      <TouchableOpacity onPress={onBack} style={styles.backLink} activeOpacity={0.75}>
        <Text style={{ color: shell.pageKicker, fontWeight: '700', fontSize: 12 }}>← Retour</Text>
      </TouchableOpacity>
      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {items.length === 0 ? (
          <Text style={[styles.searchHint, { color: shell.pageKicker }]}>Aucun résultat.</Text>
        ) : (
          items.map((item) => (
            <OptionRow key={item} shell={shell} title={item} onPress={() => onPick(item)} />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 8,
  },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '86%',
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 8 },
  subtitle: { fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
  searchHint: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16, marginBottom: 8 },
  list: { maxHeight: 360, paddingHorizontal: 16 },
  row: { marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  navBtn: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  communeOnly: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  backLink: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 },
  close: { alignItems: 'center', paddingVertical: 12 },
});
