import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore, useAppStore } from './stores';
import { syncElectronAccessToken } from './lib/auth-session';
import { AuthHydrationGate, ProtectedRoute, LicensedRoute } from './components/AuthGate';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
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
import { AppLayout } from './components/AppLayout';

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
  const accessToken = useAuthStore((s) => s.accessToken);

  return (
    <Routes>
      <Route
        path="/login"
        element={accessToken ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          accessToken ? (
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="parties" element={<LicensedRoute moduleKey="party"><PartiesPage /></LicensedRoute>} />
        <Route path="products" element={<LicensedRoute moduleKey="products"><ProductsPage /></LicensedRoute>} />
        <Route path="customers" element={<LicensedRoute moduleKey="customers"><CustomersPage /></LicensedRoute>} />
        <Route path="suppliers" element={<LicensedRoute moduleKey="suppliers"><SuppliersPage /></LicensedRoute>} />
        <Route path="warehouses" element={<LicensedRoute moduleKey="warehouses"><WarehousesPage /></LicensedRoute>} />
        <Route path="inventory" element={<LicensedRoute moduleKey="inventory" featureKey="inventory.stock"><InventoryPage /></LicensedRoute>} />
        <Route path="sales" element={<LicensedRoute moduleKey="sales"><SalesPage /></LicensedRoute>} />
        <Route path="purchasing" element={<LicensedRoute moduleKey="purchasing"><PurchasingPage /></LicensedRoute>} />
        <Route path="projects" element={<LicensedRoute moduleKey="projects" featureKey="projects.projects"><ProjectsPage /></LicensedRoute>} />
        <Route path="cost-centers" element={<LicensedRoute moduleKey="projects" featureKey="projects.cost-centers"><CostCentersPage /></LicensedRoute>} />
        <Route path="construction/contracts" element={<LicensedRoute moduleKey="construction" featureKey="construction.contracts"><ConstructionContractsPage /></LicensedRoute>} />
        <Route path="construction/boq/:contractId" element={<LicensedRoute moduleKey="construction" featureKey="construction.boq"><ConstructionBoqPage /></LicensedRoute>} />
        <Route path="construction/progress" element={<LicensedRoute moduleKey="construction" featureKey="construction.progress"><ConstructionProgressPage /></LicensedRoute>} />
        <Route path="accounting" element={<LicensedRoute moduleKey="accounting"><AccountingPage /></LicensedRoute>} />
        <Route path="pos" element={<LicensedRoute moduleKey="pos"><PosPage /></LicensedRoute>} />
        <Route path="users" element={<UsersPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthHydrationGate>
        <AuthBootstrap />
        <AppRoutes />
      </AuthHydrationGate>
    </BrowserRouter>
  );
}
