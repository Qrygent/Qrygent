import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { VaultPage } from './pages/VaultPage';
import { AgentsPqcPage } from './pages/AgentsPqcPage';
import { MandatesPage } from './pages/MandatesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { SecurityPage } from './pages/SecurityPage';
import { BenchmarksPage } from './pages/BenchmarksPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/agents" element={<AgentsPqcPage />} />
        <Route path="/mandates" element={<MandatesPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/benchmarks" element={<BenchmarksPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
