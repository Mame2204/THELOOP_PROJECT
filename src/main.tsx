import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AdminDataProvider } from '@/context/AdminDataContext';
import { ContentProvider } from '@/context/ContentContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { MemberGradeProvider } from '@/context/MemberGradeContext';
import { PartnerDataProvider } from '@/context/PartnerDataContext';
import { PublicSearchProvider } from '@/context/PublicSearchContext';
import { validateSupabaseConnection } from '@/lib/supabaseClient';
import { router } from '@/routes';
import './index.css';

void validateSupabaseConnection();

function hideSplash() {
  const splash = document.getElementById('pwa-splash');
  if (!splash) return;
  splash.classList.add('hide');
  window.setTimeout(() => splash.remove(), 400);
}

function AppProviders() {
  return (
    <AuthProvider>
      <MemberGradeProvider>
        <AdminDataProvider>
          <ContentProvider>
            <FavoritesProvider>
              <PartnerDataProvider>
                <PublicSearchProvider>
                  <RouterProvider router={router} />
                </PublicSearchProvider>
              </PartnerDataProvider>
            </FavoritesProvider>
          </ContentProvider>
        </AdminDataProvider>
      </MemberGradeProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);

hideSplash();
