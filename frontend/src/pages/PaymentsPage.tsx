import { useState, type FormEvent } from 'react';
import { CheckCircle2, FileCode2, Send, ShieldAlert } from 'lucide-react';
import { envConfig } from '../config/env';
import type { VerificationSuccessResponse } from '../domain/types';
import { formatUtcTimestamp, truncateHex } from '../domain/units';
import { usePayments, useVerifyPayment } from '../hooks/useQrygentData';
import { paymentVerificationEnvelopeSchema } from '../services/pqcVerifier/schemas';
import {
  DualStageAuthPipeline,
  IDLE_PIPELINE_STATE,
  type AuthorizationPipelineState,
} from '../components/pqc/DualStageAuthPipeline';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

const ENVELOPE_PLACEHOLDER = `{
  "protocolVersion": "1",
  "request": {
    "chainId": "YOUR_VERIFIED_CHAIN_ID",
    "vault": "0x0000000000000000000000000000000000000000",
    "agentId": "0x...",
    "keyId": "0x...",
    "mandateId": "0x...",
    "token": "0x0000000000000000000000000000000000000000",
    "recipient": "0x0000000000000000000000000000000000000000",
    "amount": "1000000",
    "nonce": "0x...",
    "deadline": 1795600000
  },
  "signature": "encoded-ML-DSA-65-signature-from-agent-cli"
}`;

export function PaymentsPage() {
  const paymentsQuery = usePayments();
  const verifyMutation = useVerifyPayment();

  const [envelopeText, setEnvelopeText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<VerificationSuccessResponse | null>(null);
  const [rejection, setRejection] = useState<{
    code: string;
    message: string;
    integrityStatus?: 'tampered_or_invalid' | 'unchecked';
  } | null>(null);
  const [serviceError, setServiceError] = useState<{ code?: string; message: string } | null>(null);
  const [pipelineState, setPipelineState] =
    useState<AuthorizationPipelineState>(IDLE_PIPELINE_STATE);

  const handleSubmitVerification = async (e: FormEvent) => {
    e.preventDefault();
    setParseError(null);
    setVerifiedReceipt(null);
    setRejection(null);
    setServiceError(null);

    if (!envelopeText.trim()) {
      setParseError('Paste a signed ML-DSA-65 payment envelope JSON produced by the agent signer.');
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(envelopeText);
    } catch {
      setParseError('Invalid JSON syntax. Verify the canonical payment envelope formatting.');
      return;
    }

    const parsed = paymentVerificationEnvelopeSchema.safeParse(rawJson);
    if (!parsed.success) {
      setParseError(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
          .join(' · '),
      );
      setPipelineState({
        ...IDLE_PIPELINE_STATE,
        stage1Canonical: 'rejected',
        summaryNote: 'Malformed Request Envelope',
      });
      return;
    }

    setPipelineState({
      ...IDLE_PIPELINE_STATE,
      stage1Canonical: 'verified',
      stage2MldsaSign: 'verified',
      stage3VerifierSig: 'active',
      stage4FreshnessMandate: 'active',
      stage5Eip712Attestation: 'idle',
      summaryNote: 'Submitting to PQC Verifier…',
    });

    const result = await verifyMutation.mutateAsync(parsed.data);

    if (result.status === 'unconfigured') {
      setServiceError({
        code: 'VERIFIER_UNCONFIGURED',
        message: `${result.reason} Missing: ${result.missing.join(', ')}.`,
      });
      setPipelineState({
        ...IDLE_PIPELINE_STATE,
        stage1Canonical: 'verified',
        stage2MldsaSign: 'verified',
        stage3VerifierSig: 'unavailable',
        stage4FreshnessMandate: 'unavailable',
        stage5Eip712Attestation: 'unavailable',
        summaryNote: 'Verifier URL Not Configured',
      });
      return;
    }

    if (result.status === 'error') {
      setServiceError({ code: result.code, message: result.message });
      setPipelineState({
        ...IDLE_PIPELINE_STATE,
        stage1Canonical: 'verified',
        stage2MldsaSign: 'verified',
        stage3VerifierSig: 'rejected',
        stage4FreshnessMandate: 'unavailable',
        stage5Eip712Attestation: 'unavailable',
        summaryNote: result.code ?? 'Verifier Request Failed',
      });
      return;
    }

    if (result.data.status === 'rejected') {
      setRejection({
        code: result.data.code,
        message: result.data.message,
        integrityStatus: result.data.integrityStatus,
      });
      setPipelineState({
        ...IDLE_PIPELINE_STATE,
        stage1Canonical: 'verified',
        stage2MldsaSign: 'verified',
        stage3VerifierSig: 'rejected',
        stage4FreshnessMandate: 'rejected',
        stage5Eip712Attestation: 'unavailable',
        summaryNote: `Rejected by PQC Verifier (${result.data.code})`,
      });
      return;
    }

    // Real verified response from PQC verification service
    setVerifiedReceipt(result.data);
    setPipelineState({
      stage1Canonical: 'verified',
      stage2MldsaSign: 'verified',
      stage3VerifierSig: 'verified',
      stage4FreshnessMandate: 'verified',
      stage5Eip712Attestation: 'verified',
      stage6ContractEnforce: 'unavailable',
      stage7Settlement: 'unavailable',
      summaryNote: 'ML-DSA-65 Verified & EIP-712 Attested · Vault ABI Pending',
    });
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        index="05"
        eyebrow="Cryptographic Payment Execution"
        title="Payment Activity & Verification"
        description="Submit real ML-DSA-65 signed payment envelopes to the PQC verification service, inspect returned EIP-712 attestations, and audit on-chain settlement history."
        actions={
          <ZoneBadge tone={envConfig.capabilities.hasPqcVerifierConfig ? 'pqc' : 'warning'}>
            {envConfig.capabilities.hasPqcVerifierConfig
              ? `POST ${envConfig.pqcServiceBaseUrl ?? ''}/v1/payments/verify`
              : 'Verifier URL Unset'}
          </ZoneBadge>
        }
      />

      {/* Live 7-Stage Pipeline Reflecting Real Request State */}
      <DualStageAuthPipeline state={pipelineState} />

      {/* Real PQC Verifier Submission Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <LedgerCard className="lg:col-span-7 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#141412]/10">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412] flex items-center gap-2">
              <FileCode2 className="w-4 h-4" />
              Submit Signed ML-DSA-65 Envelope
            </h2>
            <span className="font-mono text-[10px] text-[#5F5E56]">docs/API.md §4</span>
          </div>

          <form onSubmit={handleSubmitVerification} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="payment-envelope"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1.5"
              >
                Canonical Request + ML-DSA-65 Signature JSON
              </label>
              <textarea
                id="payment-envelope"
                rows={11}
                value={envelopeText}
                onChange={(e) => setEnvelopeText(e.target.value)}
                placeholder={ENVELOPE_PLACEHOLDER}
                className="w-full p-3 border border-[#141412]/25 bg-[#F7F5F0] font-mono text-[11px] leading-relaxed focus:outline-none focus:border-[#2B59C3] focus:bg-white"
              />
            </div>

            {parseError ? (
              <ErrorAlert
                title="Canonical Envelope Validation Failed"
                code="MALFORMED_REQUEST"
                message={parseError}
              />
            ) : null}

            {serviceError ? (
              <ErrorAlert
                title="PQC Verifier Request Failed"
                code={serviceError.code}
                message={serviceError.message}
              />
            ) : null}

            {rejection ? (
              <ErrorAlert
                title="Payment Request Rejected by PQC Verifier"
                code={rejection.code}
                message={rejection.message}
              />
            ) : null}

            <button
              type="submit"
              disabled={verifyMutation.isPending}
              className="w-full py-3 px-4 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#1a1c19] disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {verifyMutation.isPending
                ? 'Verifying ML-DSA-65 Signature…'
                : 'Verify Signature & Request EIP-712 Attestation'}
            </button>
          </form>
        </LedgerCard>

        {/* Verification & Attestation Receipt Inspector */}
        <PqcDarkCard className="lg:col-span-5 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#262924]">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#B8F229]">
                Cryptographic Receipt Inspector
              </span>
              <span className="font-mono text-[10px] text-[#9C9A91]">
                {verifiedReceipt ? 'ATTESTED' : rejection ? 'REJECTED' : 'AWAITING RESPONSE'}
              </span>
            </div>

            {verifiedReceipt ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center gap-2 text-[#B8F229]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>ML-DSA-65 Verified · EIP-712 Attestation Issued</span>
                </div>
                <dl className="divide-y divide-[#262924] text-[11px]">
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Algorithm</dt>
                    <dd className="text-[#B8F229]">
                      {verifiedReceipt.verification?.algorithm ?? 'ML-DSA-65'} (FIPS 204)
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Payload Integrity</dt>
                    <dd className="text-[#B8F229] uppercase">
                      {verifiedReceipt.verification?.integrityStatus ?? 'intact'}
                    </dd>
                  </div>
                  {verifiedReceipt.verification?.publicKeyFingerprint ? (
                    <div className="py-2 flex justify-between gap-2">
                      <dt className="text-[#9C9A91]">Public-Key Fingerprint</dt>
                      <dd className="text-[#F4F1EA]">
                        {verifiedReceipt.verification.publicKeyFingerprint.slice(0, 22)}…
                      </dd>
                    </div>
                  ) : null}
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Request ID</dt>
                    <dd className="text-[#F4F1EA]">{verifiedReceipt.requestId}</dd>
                  </div>
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Mandate ID</dt>
                    <dd className="text-[#F4F1EA]">
                      {truncateHex(verifiedReceipt.attestation.mandateId, 10, 6)}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Request Digest</dt>
                    <dd className="text-[#F4F1EA]">
                      {truncateHex(verifiedReceipt.attestation.requestDigest, 10, 8)}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Authorized Verifier</dt>
                    <dd className="text-[#F4F1EA]">
                      {truncateHex(verifiedReceipt.attestation.verifier, 8, 6)}
                    </dd>
                  </div>
                  {verifiedReceipt.verification?.verifiedAt ? (
                    <div className="py-2 flex justify-between gap-2">
                      <dt className="text-[#9C9A91]">Verified At</dt>
                      <dd className="text-[#F4F1EA]">{verifiedReceipt.verification.verifiedAt}</dd>
                    </div>
                  ) : null}
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Attestation Deadline</dt>
                    <dd className="text-[#F4F1EA]">
                      {formatUtcTimestamp(verifiedReceipt.attestation.deadline)}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-2">
                    <dt className="text-[#9C9A91]">Nonce</dt>
                    <dd className="text-[#F4F1EA]">
                      {truncateHex(verifiedReceipt.attestation.nonce, 10, 6)}
                    </dd>
                  </div>
                </dl>
                <div className="p-3 bg-[#151714] border border-[#262924] text-[11px] text-[#9C9A91]">
                  On-chain submission to <code>Vault.executePayment(...)</code> is disabled until
                  the Smart Contract Lead delivers the frozen Vault ABI and ADR-007 submission mode
                  is finalized.
                </div>
              </div>
            ) : rejection ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2 text-[#f87171] font-mono">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>VERIFICATION REJECTED: {rejection.code}</span>
                </div>
                <div className="font-mono text-[11px] text-[#9C9A91]">
                  Payload Integrity:{' '}
                  <span className="text-[#f87171] uppercase">
                    {rejection.integrityStatus === 'tampered_or_invalid'
                      ? 'Tampered or Invalid Signature'
                      : 'Rejected Before Attestation'}
                  </span>
                </div>
                <p className="text-[#9C9A91] leading-relaxed">{rejection.message}</p>
                <p className="font-mono text-[10px] text-[#7D7B73]">
                  Fail-closed: no EIP-712 attestation was issued.
                </p>
              </div>
            ) : (
              <div className="py-8 space-y-2 text-xs text-[#9C9A91]">
                <p className="text-[#F4F1EA] font-medium">No Verification Executed Yet</p>
                <p className="leading-relaxed">
                  Qrygent never displays an &ldquo;ML-DSA-65 Verified&rdquo; state without an actual
                  schema-validated response from <code>POST /v1/payments/verify</code>.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#262924] font-mono text-[10px] text-[#7D7B73]">
            Algorithm: ML-DSA-65 (Agent Intent) → ECDSA EIP-712 (Verifier Attestation)
          </div>
        </PqcDarkCard>
      </div>

      {/* Historical Payment Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
            On-Chain Payment History
          </h2>
          <span className="font-mono text-[11px] text-[#5F5E56]">
            Amount · Recipient · Agent · Mandate · Tx Hash · Verification &amp; Execution State
          </span>
        </div>

        {paymentsQuery.data?.status === 'unconfigured' ? (
          <UnavailableIntegrationCard
            title="On-Chain Payment History Unavailable"
            reason={paymentsQuery.data.reason}
            missing={paymentsQuery.data.missing}
            owner={paymentsQuery.data.owner}
          />
        ) : null}
      </section>
    </div>
  );
}
