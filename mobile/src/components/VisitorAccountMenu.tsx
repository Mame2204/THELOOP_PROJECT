import { Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useFavoritesSignup } from '@/context/FavoritesSignupContext';
import type { RootStackParamList } from '@/navigation/types';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  shell: ShellTheme;
}

export function VisitorAccountMenu({ shell }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { openSignupSheet } = useFavoritesSignup();

  return (
    <Pressable
      onPress={() => openSignupSheet(navigation)}
      hitSlop={10}
      style={[styles.avatarBtn, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
      accessibilityLabel="Connexion, inscription ou partenariat"
    >
      <Text style={[styles.avatarIcon, { color: shell.pageTitle }]}>👤</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 18 },
});
