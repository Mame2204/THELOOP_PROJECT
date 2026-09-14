import { Navigate, Route, Routes } from 'react-router-dom';
import { usePermissions } from './context/PermissionsContext';
import { AdminLayout } from './layout/AdminLayout';
import { RequirePermission } from './layout/RequirePermission';
import { LoginPage } from './pages/LoginPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { UsersPage } from './pages/UsersPage';
import { PassPage } from './pages/PassPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function HomeRedirect() {
  const { can, canDemandes } = usePermissions();
  if (can('pass_payments') || can('pass_management')) return <Navigate to="/payments" replace />;
  if (can('users')) return <Navigate to="/users" replace />;
  if (canDemandes) return <Navigate to="/demandes" replace />;
  if (can('content')) return <Navigate to="/contenu" replace />;
  if (can('insights')) return <Navigate to="/insights" replace />;
  return <Navigate to="/users" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route
          path="payments"
          element={
            <RequirePermission permission="pass_payments">
              <PaymentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permission="users">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="pass"
          element={
            <RequirePermission permission="pass_management">
              <PassPage />
            </RequirePermission>
          }
        />
        <Route
          path="insights"
          element={
            <RequirePermission permission="insights">
              <PlaceholderPage
                title="Insights"
                description="Statistiques d’engagement et du catalogue."
              />
            </RequirePermission>
          }
        />
        <Route
          path="accueil"
          element={
            <RequirePermission permission="featured">
              <PlaceholderPage
                title="Accueil"
                description="Blocs Accueil membre (À la une, sondage, parcours…)."
              />
            </RequirePermission>
          }
        />
        <Route
          path="onglets"
          element={
            <RequirePermission permission="rubrique">
              <PlaceholderPage
                title="Onglets app"
                description="Visibilité Agenda / Spots / Outils et espace pro."
              />
            </RequirePermission>
          }
        />
        <Route
          path="loop"
          element={
            <RequirePermission permission="loop_hub">
              <PlaceholderPage
                title="THE LOOP"
                description="Hub publication équipe THE LOOP."
              />
            </RequirePermission>
          }
        />
        <Route
          path="contenu"
          element={
            <RequirePermission permission="content">
              <PlaceholderPage
                title="Contenu"
                description="Catalogue events, spots, outils, parcours…"
              />
            </RequirePermission>
          }
        />
        <Route
          path="demandes"
          element={
            <RequirePermission permission="demandes">
              <PlaceholderPage
                title="Demandes"
                description="Partenariats, modération staging et suggestions."
              />
            </RequirePermission>
          }
        />
        <Route
          path="privileges"
          element={
            <RequirePermission permission="prime_benefits">
              <PlaceholderPage
                title="Privilèges"
                description="Catalogue, validation partenaire et octrois."
              />
            </RequirePermission>
          }
        />
        <Route
          path="teams"
          element={
            <RequirePermission permission="staff_benefits">
              <PlaceholderPage title="TEAMS" description="Pack privilèges équipe admin." />
            </RequirePermission>
          }
        />
        <Route
          path="tirage"
          element={
            <RequirePermission permission="benefit_draw">
              <PlaceholderPage title="Tirage" description="Tirages privilèges par rôle." />
            </RequirePermission>
          }
        />
        <Route
          path="parametres"
          element={
            <RequirePermission permission="manage_admins">
              <PlaceholderPage
                title="Paramètres"
                description="Gates plateforme, permissions, catégories, légal…"
              />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
