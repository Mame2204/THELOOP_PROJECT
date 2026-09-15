import {
  ADMIN_PERMISSION_GROUPS,
  editableAdminPermissions,
  getPermissionsByGroup,
  type AdminPermissionGroupId,
} from '../lib/permission-catalog';
import type { AdminPermissionId } from '../lib/permissions';

export function PermissionGroupEditor({
  value,
  onChange,
}: {
  value: AdminPermissionId[];
  onChange: (next: AdminPermissionId[]) => void;
}) {
  const editable = editableAdminPermissions();
  const editableIds = new Set(editable.map((p) => p.id));

  function toggle(id: AdminPermissionId, checked: boolean) {
    onChange(checked ? [...new Set([...value, id])] : value.filter((p) => p !== id));
  }

  function toggleGroup(groupId: AdminPermissionGroupId, checked: boolean) {
    const ids = getPermissionsByGroup(groupId).map((p) => p.id).filter((id) => editableIds.has(id));
    if (checked) {
      onChange([...new Set([...value, ...ids])]);
    } else {
      onChange(value.filter((p) => !ids.includes(p)));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {ADMIN_PERMISSION_GROUPS.map((group) => {
        const items = getPermissionsByGroup(group.id).filter((p) => editableIds.has(p.id));
        if (!items.length) return null;
        const allChecked = items.every((p) => value.includes(p.id));
        const someChecked = items.some((p) => value.includes(p.id));
        return (
          <div key={group.id} className="card" style={{ padding: 12 }}>
            <label className="check-inline" style={{ display: 'flex', fontWeight: 700, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = !allChecked && someChecked;
                }}
                onChange={(e) => toggleGroup(group.id, e.target.checked)}
              />
              {group.label}
            </label>
            {group.hint ? <p className="meta" style={{ margin: '0 0 8px 24px' }}>{group.hint}</p> : null}
            <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((p) => (
                <label key={p.id} className="check-inline" style={{ display: 'flex' }}>
                  <input
                    type="checkbox"
                    checked={value.includes(p.id)}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                  />
                  <span>
                    <strong>{p.label}</strong>
                    {p.parentId ? <span className="meta"> · {p.description}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
