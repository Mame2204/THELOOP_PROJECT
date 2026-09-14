import { Navigate, Route, Routes } from 'react-router-dom';
import { usePermissions } from './context/PermissionsContext';
import { AdminLayout } from './layout/AdminLayout';
import { RequirePermission } from './layout/RequirePermission';
import { LoginPage } from './pages/LoginPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { UsersPage } from './pages/UsersPage';
import { PassPage } from './pages/PassPage';
import { DemandesPage } from './pages/DemandesPage';
import { ContenuPage } from './pages/ContenuPage';
import { AccueilPage } from './pages/AccueilPage';
import { LoopPage } from './pages/LoopPage';
import { PrivilegesPage } from './pages/PrivilegesPage';
import { InsightsPage } from './pages/InsightsPage';
import { ParametresPage } from './pages/ParametresPage';
import { OngletsPage } from './pages/OngletsPage';
import { TeamsPage } from './pages/TeamsPage';
import { TiragePage } from './pages/TiragePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AutomationPage } from './pages/AutomationPage';
import { MilestonesPage } from './pages/MilestonesPage';

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
              <InsightsPage />
            </RequirePermission>
          }
        />
        <Route
          path="accueil"
          element={
            <RequirePermission permission="featured">
              <AccueilPage />
            </RequirePermission>
          }
        />
        <Route
          path="onglets"
          element={
            <RequirePermission permission="rubrique">
              <OngletsPage />
            </RequirePermission>
          }
        />
        <Route
          path="loop"
          element={
            <RequirePermission permission="loop_hub">
              <LoopPage />
            </RequirePermission>
          }
        />
        <Route
          path="contenu"
          element={
            <RequirePermission permission="content">
              <ContenuPage />
            </RequirePermission>
          }
        />
        <Route
          path="demandes"
          element={
            <RequirePermission permission="demandes">
              <DemandesPage />
            </RequirePermission>
          }
        />
        <Route
          path="privileges"
          element={
            <RequirePermission permission="prime_benefits">
              <PrivilegesPage />
            </RequirePermission>
          }
        />
        <Route
          path="teams"
          element={
            <RequirePermission permission="staff_benefits">
              <TeamsPage />
            </RequirePermission>
          }
        />
        <Route
          path="tirage"
          element={
            <RequirePermission permission="benefit_draw">
              <TiragePage />
            </RequirePermission>
          }
        />
        <Route
          path="notifications"
          element={
            <RequirePermission permission="notifications">
              <NotificationsPage />
            </RequirePermission>
          }
        />
        <Route
          path="automation"
          element={
            <RequirePermission permission="automation">
              <AutomationPage />
            </RequirePermission>
          }
        />
        <Route
          path="milestones"
          element={
            <RequirePermission permission="partner_milestones">
              <MilestonesPage />
            </RequirePermission>
          }
        />
        <Route
          path="parametres"
          element={
            <RequirePermission permission="manage_admins">
              <ParametresPage />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
