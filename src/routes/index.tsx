import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

// Public
import { HomePage } from '@/pages/public/HomePage';
import { EventDetailPage } from '@/pages/public/EventDetailPage';
import { GuidePage } from '@/pages/public/GuidePage';
import { LocationDetailPage } from '@/pages/public/LocationDetailPage';
import { FavorisPage } from '@/pages/public/FavorisPage';
import { ProfilPage } from '@/pages/public/ProfilPage';
import { AbonnementPage } from '@/pages/public/AbonnementPage';

// Loop Prime
import { PrimePresentationPage } from '@/pages/prime/PrimePresentationPage';

// Partners
import { PartnerLoginPage } from '@/pages/partners/PartnerLoginPage';
import { PartnerApplicationPage } from '@/pages/partners/PartnerApplicationPage';
import { PartnerHubPage } from '@/pages/partners/PartnerHubPage';
import { PartnerStatsPage } from '@/pages/partners/PartnerStatsPage';

// Admin
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminSliderPage } from '@/pages/admin/AdminSliderPage';
import { AdminModerationPage } from '@/pages/admin/AdminModerationPage';
import { AdminTokensPage } from '@/pages/admin/AdminTokensPage';
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';

// Exclusif
import { LoopPrimeActivationPage } from '@/pages/exclusif/LoopPrimeActivationPage';
import { AuthCallbackPage } from '@/pages/public/AuthCallbackPage';
import { PASS_PURCHASE_UI_ENABLED } from '@/lib/pass-purchase-ui';

function LegacyGuideSlugRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/spots/${slug}` : '/spots'} replace />;
}

export const router = createBrowserRouter([
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/exclusif/activation', element: <LoopPrimeActivationPage /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'agenda', element: <Navigate to="/" replace /> },
      { path: 'agenda/:slug', element: <EventDetailPage /> },
      { path: 'spots', element: <GuidePage /> },
      { path: 'spots/:slug', element: <LocationDetailPage /> },
      { path: 'guide', element: <Navigate to="/spots" replace /> },
      { path: 'guide/:slug', element: <LegacyGuideSlugRedirect /> },
      {
        path: 'favoris',
        element: (
          <ProtectedRoute minimumRole="USER_FREE" redirectTo="/">
            <FavorisPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profil',
        element: (
          <ProtectedRoute minimumRole="USER_FREE" redirectTo="/">
            <ProfilPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'abonnement',
        element: PASS_PURCHASE_UI_ENABLED ? (
          <ProtectedRoute minimumRole="USER_PRIME" redirectTo="/">
            <AbonnementPage />
          </ProtectedRoute>
        ) : (
          <Navigate to="/" replace />
        ),
      },
      { path: 'mon-espace', element: <Navigate to="/profil" replace /> },
      { path: 'prime/repertoire', element: <Navigate to={PASS_PURCHASE_UI_ENABLED ? '/prime' : '/'} replace /> },
      {
        path: 'prime',
        element: PASS_PURCHASE_UI_ENABLED ? (
          <ProtectedRoute minimumRole="USER_FREE" redirectTo="/">
            <PrimePresentationPage />
          </ProtectedRoute>
        ) : (
          <Navigate to="/" replace />
        ),
      },
      { path: 'black-loop', element: <Navigate to={PASS_PURCHASE_UI_ENABLED ? '/prime' : '/'} replace /> },
      { path: 'black-loop/repertoire', element: <Navigate to={PASS_PURCHASE_UI_ENABLED ? '/prime' : '/'} replace /> },
      { path: 'black-loop/conciergerie', element: <Navigate to={PASS_PURCHASE_UI_ENABLED ? '/prime' : '/'} replace /> },
      { path: 'partenaires', element: <PartnerLoginPage /> },
      { path: 'partenaires/demande', element: <PartnerApplicationPage /> },
      {
        path: 'espace-partenaire',
        element: (
          <ProtectedRoute allowedRoles={['PARTNER', 'ADMIN']} redirectTo="/partenaires">
            <PartnerHubPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'espace-partenaire/stats',
        element: (
          <ProtectedRoute allowedRoles={['PARTNER', 'ADMIN']} redirectTo="/partenaires">
            <PartnerStatsPage />
          </ProtectedRoute>
        ),
      },
      { path: 'partenaires/soumettre', element: <Navigate to="/espace-partenaire" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/admin',
    children: [
      { path: 'login', element: <AdminLoginPage /> },
      {
        element: (
          <ProtectedRoute allowedRoles={['ADMIN']} redirectTo="/admin/login">
            <AdminLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'moderation', element: <AdminModerationPage /> },
          { path: 'categories', element: <AdminCategoriesPage /> },
          { path: 'utilisateurs', element: <AdminUsersPage /> },
          { path: 'slider', element: <AdminSliderPage /> },
          { path: 'jetons', element: <AdminTokensPage /> },
          { path: 'hero', element: <Navigate to="/admin/slider" replace /> },
        ],
      },
    ],
  },
]);
