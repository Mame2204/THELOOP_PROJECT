import { adminAccueilContentActionsFor } from '@/lib/admin-types';

describe('adminAccueilContentActionsFor', () => {
  it('published : désactiver et supprimer, pas archiver ni brouillon', () => {
    const actions = adminAccueilContentActionsFor('published');
    expect(actions).toEqual({
      canEdit: true,
      canPublish: false,
      canDeactivate: true,
      canMoveToDraft: false,
      canArchive: false,
      canDelete: true,
    });
  });

  it('deactivated : republier et supprimer', () => {
    const actions = adminAccueilContentActionsFor('deactivated');
    expect(actions).toEqual({
      canEdit: true,
      canPublish: true,
      canDeactivate: false,
      canMoveToDraft: false,
      canArchive: false,
      canDelete: true,
    });
  });

  it('draft/archived : republier sans archivage', () => {
    expect(adminAccueilContentActionsFor('draft').canArchive).toBe(false);
    expect(adminAccueilContentActionsFor('archived').canArchive).toBe(false);
  });
});
