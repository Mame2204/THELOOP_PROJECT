import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TogglePill } from '@/components/admin/TogglePill';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import {
  ADMIN_PERMISSION_GROUPS,
  getChildPermissions,
  getPermissionsByGroup,
  togglePermissionSelection,
  type AdminPermissionDef,
  type AdminPermissionGroupId,
  type AdminPermissionId,
} from '@/lib/admin-permissions';
import type { useMemberTheme } from '@/hooks/useMemberTheme';

interface Props {
  selected: AdminPermissionId[];
  onChange: (next: AdminPermissionId[]) => void;
  shell: ReturnType<typeof useMemberTheme>['shell'];
  disabled?: boolean;
  showSuperAdminOnly?: boolean;
}

function GroupBlock({
  groupId,
  selected,
  onChange,
  shell,
  disabled,
  showSuperAdminOnly,
}: Props & { groupId: AdminPermissionGroupId }) {
  const [expanded, setExpanded] = useState(true);
  const group = ADMIN_PERMISSION_GROUPS.find((g) => g.id === groupId);
  const items = useMemo(
    () => getPermissionsByGroup(groupId).filter((p) => showSuperAdminOnly || !p.superAdminOnly),
    [groupId, showSuperAdminOnly],
  );
  if (!items.length) return null;

  const isSubTabGroup = !['navigation', 'demandes', 'parametres'].includes(groupId);

  const renderRow = (perm: AdminPermissionDef, depth = 0) => {
    const isOn = selected.includes(perm.id);

    return (
      <Pressable
        key={perm.id}
        style={[styles.row, depth > 0 && styles.rowChild, { paddingLeft: 12 + depth * 14 }]}
        onPress={() => !disabled && onChange(togglePermissionSelection(selected, perm.id, !isOn))}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: shell.pageTitle }]}>{perm.label}</Text>
          <Text style={[styles.rowDesc, { color: shell.pageKicker }]} numberOfLines={2}>
            {perm.description}
          </Text>
        </View>
        <TogglePill
          value={isOn}
          onChange={(next) => onChange(togglePermissionSelection(selected, perm.id, next))}
          activeLabel="ON"
          inactiveLabel="OFF"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
          disabled={disabled}
        />
      </Pressable>
    );
  };

  const renderModuleWithChildren = (perm: AdminPermissionDef) => {
    const children = getChildPermissions(perm.id).filter((c) => items.some((i) => i.id === c.id));
    const isOn = selected.includes(perm.id);
    const grantedChildren = children.filter((c) => selected.includes(c.id));
    const restricted = isOn && grantedChildren.length > 0;

    return (
      <View key={perm.id}>
        <Pressable
          style={styles.row}
          onPress={() => !disabled && onChange(togglePermissionSelection(selected, perm.id, !isOn))}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: shell.pageTitle }]}>{perm.label}</Text>
            <Text style={[styles.rowDesc, { color: shell.pageKicker }]} numberOfLines={2}>
              {perm.description}
            </Text>
            {children.length > 0 && isOn ? (
              <Text style={[styles.subHint, { color: restricted ? ADMIN_THEME.accent : shell.pageKicker }]}>
                {restricted
                  ? `${grantedChildren.length} sous-module(s) actif(s)`
                  : 'Accès complet (affinez dans le groupe sous-onglets)'}
              </Text>
            ) : null}
          </View>
          <TogglePill
            value={isOn}
            onChange={(next) => onChange(togglePermissionSelection(selected, perm.id, next))}
            activeLabel="ON"
            inactiveLabel="OFF"
            activeColor={ADMIN_THEME.accent}
            shell={shell}
            disabled={disabled}
          />
        </Pressable>
      </View>
    );
  };

  const roots = isSubTabGroup
    ? items
    : groupId === 'parametres'
      ? items
      : items.filter((p) => !p.parentId);

  return (
    <View style={[styles.groupCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
      <Pressable style={styles.groupHeader} onPress={() => setExpanded((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupTitle, { color: shell.pageTitle }]}>{group?.label ?? groupId}</Text>
          {group?.hint ? (
            <Text style={[styles.groupHint, { color: shell.pageKicker }]}>{group.hint}</Text>
          ) : null}
        </View>
        <Text style={{ color: shell.pageKicker, fontWeight: '800' }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded
        ? roots.map((perm) => (isSubTabGroup ? renderRow(perm) : renderModuleWithChildren(perm)))
        : null}
    </View>
  );
}

export function AdminPermissionGroupEditor(props: Props) {
  return (
    <View style={styles.wrap}>
      {ADMIN_PERMISSION_GROUPS.map((group) => (
        <GroupBlock key={group.id} {...props} groupId={group.id} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  groupCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  groupTitle: { fontSize: 14, fontWeight: '800' },
  groupHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowChild: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)' },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  subHint: { fontSize: 10, marginTop: 4, fontWeight: '600' },
});
