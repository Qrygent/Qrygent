import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '../config/wagmi';
import { App } from '../App';

function renderAtRoute(route: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </WagmiProvider>,
  );
}

describe('Qrygent App honest integration states & security representation', () => {
  it('renders Overview with honest unconfigured states, testnet disclosure, and hybrid trust model', async () => {
    renderAtRoute('/');

    expect(
      screen.getByRole('heading', { name: /Vault & Authorization Overview/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Testnet Only · No Real Value/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vault Contract Unconfigured/i)).toBeInTheDocument();
    expect(screen.getByText(/Hybrid Trust Disclosure/i)).toBeInTheDocument();
    expect(screen.getByText(/7-Stage Hybrid Authorization Architecture/i)).toBeInTheDocument();
  });

  it('separates PQC Verifier rejections from Smart Contract enforcement on Security page', async () => {
    renderAtRoute('/security');

    expect(
      screen.getByRole('heading', { name: /Security & PQC Monitoring/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Layer 1 · PQC Verifier Rejections/i)).toBeInTheDocument();
    expect(screen.getByText(/Layer 2 · On-Chain Contract Enforcement/i)).toBeInTheDocument();
    expect(screen.getByText('INVALID_SIGNATURE')).toBeInTheDocument();
    expect(screen.getByText('NONCE_ALREADY_USED')).toBeInTheDocument();
  });

  it('shows honest unavailable state on Benchmarks page instead of inventing numbers', async () => {
    renderAtRoute('/benchmarks');

    expect(
      screen.getByRole('heading', { name: /Cryptographic Benchmarks/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/No Measured PQC Benchmark Dataset Available Yet/i),
    ).toBeInTheDocument();
  });

  it('displays startup environment diagnostics and wallet state on Settings page', async () => {
    renderAtRoute('/settings');

    expect(
      screen.getByRole('heading', { name: /Settings & Configuration/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('VITE_CHAIN_ID')).toBeInTheDocument();
    expect(screen.getByText('VITE_VAULT_ADDRESS')).toBeInTheDocument();
    expect(screen.getByText('VITE_PQC_SERVICE_BASE_URL')).toBeInTheDocument();
    expect(screen.getByText(/Disconnected/i)).toBeInTheDocument();
  });
});
