import { Routes, Route, Navigate } from 'react-router-dom';
import { AppRouter } from './lib/app-router';
import { useEffect } from 'react';
import { useAuthStore, useAppStore } from './stores';
import { syncElectronAccessToken } from './lib/auth-session';
import {
  AuthHydrationGate,
  AuthSessionListener,
  GuestOnly,
  RequireAuth,
} from './components/AuthGate';
import { PlatformAdminRoute } from './components/PlatformAdminRoute';
import { LoginPage } from './pages/LoginPage';
import { DemoEntryPage } from './pages/DemoEntryPage';
import { ModuleHubPage } from './pages/ModuleHubPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { PartiesPage } from './pages/PartiesPage';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { InventoryPage } from './pages/InventoryPage';
import { SalesPage } from './pages/SalesPage';
import { PurchasingPage } from './pages/PurchasingPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { CostCentersPage } from './pages/CostCentersPage';
import { AccountingPage } from './pages/AccountingPage';
import { PosPage } from './pages/PosPage';
import { UsersPage } from './pages/UsersPage';
import { BranchesPage } from './pages/BranchesPage';
import { ConstructionContractsPage } from './pages/ConstructionContractsPage';
import { ConstructionBoqPage } from './pages/ConstructionBoqPage';
import { ConstructionProgressPage } from './pages/ConstructionProgressPage';
import { OnboardingGate } from './components/OnboardingGate';
import { OnboardingPage } from './pages/OnboardingPage';
import { AppLayout } from './components/AppLayout';
import { ControlCenterLayout } from './pages/control/ControlCenterLayout';
import { ControlCenterDashboardPage } from './pages/control/ControlCenterDashboardPage';
import { OrganizationsPage } from './pages/control/OrganizationsPage';
import { DemoManagementPage } from './pages/control/DemoManagementPage';
import { ModuleManagementPage } from './pages/control/ModuleManagementPage';
import { AuthorizationMatrixPage } from './pages/control/AuthorizationMatrixPage';
import { ReportsPage } from './pages/ReportsPage';

function AuthBootstrap() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const apiUrl = useAppStore((s) => s.apiUrl);

  useEffect(() => {
    if (accessToken) {
      void syncElectronAccessToken();
    }
  }, [accessToken]);

  useEffect(() => {
    if (!window.desktopApi || !apiUrl) return;
    void window.desktopApi.setApiUrl(apiUrl);
  }, [apiUrl]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<OnboardingGate />}>
          <Route element={<AppLayout />}>
            <Route index element={<ModuleHubPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="parties" element={<PartiesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="warehouses" element={<WarehousesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="purchasing" element={<PurchasingPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="cost-centers" element={<CostCentersPage />} />
            <Route path="construction/contracts" element={<ConstructionContractsPage />} />
            <Route path="construction/boq/:contractId" element={<ConstructionBoqPage />} />
            <Route path="construction/progress" element={<ConstructionProgressPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/integrations" element={<IntegrationsPage />} />
          </Route>
        </Route>

        <Route
          path="/control"
          element={
            <PlatformAdminRoute>
              <ControlCenterLayout />
            </PlatformAdminRoute>
          }
        >
          <Route index element={<ControlCenterDashboardPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="demos" element={<DemoManagementPage />} />
          <Route path="modules" element={<ModuleManagementPage />} />
          <Route path="authorization" element={<AuthorizationMatrixPage />} />
        </Route>
      </Route>

      <Route path="/demo/*" element={<DemoEntryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppRouter>
      <AuthHydrationGate>
        <AuthBootstrap />
        <AuthSessionListener />
        <AppRoutes />
      </AuthHydrationGate>
    </AppRouter>
  );
}
