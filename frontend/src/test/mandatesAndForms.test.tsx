import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '../config/wagmi';
import { MandatesPage } from '../pages/MandatesPage';
import { AgentsPqcPage } from '../pages/AgentsPqcPage';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </WagmiProvider>,
  );
}

describe('Mandate creation form validation', () => {
  it('blocks submission with clear errors when per-payment cap exceeds aggregate budget', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MandatesPage />);

    await user.type(screen.getByLabelText(/Authorized Agent ID/i), `0x${'ab'.repeat(32)}`);
    await user.type(
      screen.getByLabelText(/Approved Recipients Allowlist/i),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Add/i }));

    await user.type(screen.getByLabelText(/Max \/ Payment/i), '500');
    await user.type(screen.getByLabelText(/Aggregate Budget/i), '200');
    await user.type(screen.getByLabelText(/Expiry Date/i), '2030-01-01T12:00');

    await user.click(screen.getByRole('button', { name: /Validate Mandate Policy/i }));

    expect(
      screen.getByText(/Maximum amount per payment cannot exceed the aggregate spending budget/i),
    ).toBeInTheDocument();
  });

  it('encodes valid mandate policy into exact uint256 base units while keeping contract blocker explicit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MandatesPage />);

    await user.type(screen.getByLabelText(/Authorized Agent ID/i), `0x${'cd'.repeat(32)}`);
    await user.type(
      screen.getByLabelText(/Approved Recipients Allowlist/i),
      '0x1111111111111111111111111111111111111111',
    );
    await user.click(screen.getByRole('button', { name: /Add/i }));

    await user.type(screen.getByLabelText(/Max \/ Payment/i), '250');
    await user.type(screen.getByLabelText(/Aggregate Budget/i), '3000');
    await user.type(screen.getByLabelText(/Expiry Date/i), '2030-01-01T12:00');

    await user.click(screen.getByRole('button', { name: /Validate Mandate Policy/i }));

    expect(screen.getByText(/maxPerPayment \(uint256\): 250000000/i)).toBeInTheDocument();
    expect(screen.getByText(/aggregateBudget \(uint256\): 3000000000/i)).toBeInTheDocument();
    expect(screen.getByText(/On-chain submission is disabled until/i)).toBeInTheDocument();
  });
});

describe('Agents & ML-DSA-65 public key registration guardrails', () => {
  it('refuses private key material pasted into the public key field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AgentsPqcPage />);

    await user.type(screen.getByLabelText(/Agent Label/i), 'Treasury Agent');
    await user.type(screen.getByLabelText(/Agent ID/i), `0x${'aa'.repeat(32)}`);
    await user.type(
      screen.getByLabelText(/ML-DSA-65 Public Key/i),
      '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(70),
    );
    await user.click(screen.getByRole('button', { name: /Validate Registration Payload/i }));

    expect(screen.getByText(/never paste private key material/i)).toBeInTheDocument();
  });
});
