import { useState, type ChangeEvent } from 'react';
import { Gauge, Upload } from 'lucide-react';
import type { BenchmarkDataset } from '../domain/types';
import { useBenchmarks } from '../hooks/useQrygentData';
import { benchmarkDatasetSchema } from '../services/pqcVerifier/schemas';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

function ComparisonBar({
  label,
  value,
  max,
  unit,
  accentClass,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  accentClass: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[11px]">
        <span className="text-[#141412]">{label}</span>
        <span className="text-[#5F5E56]">
          {value.toLocaleString(undefined, { maximumFractionDigits: 3 })} {unit}
        </span>
      </div>
      <div className="h-2.5 bg-[#ECEAE3] border border-[#141412]/15 overflow-hidden">
        <div className={`h-full ${accentClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BenchmarksPage() {
  const benchmarksQuery = useBenchmarks();
  const [loadedDataset, setLoadedDataset] = useState<BenchmarkDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeDataset =
    loadedDataset ??
    (benchmarksQuery.data?.status === 'ready' ? benchmarksQuery.data.data : null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setLoadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const parsed = benchmarkDatasetSchema.safeParse(json);
      if (!parsed.success) {
        setLoadError(
          `Benchmark JSON failed validation: ${parsed.error.issues[0]?.message ?? 'invalid schema'}. Only measured datasets with library/runtime metadata are accepted.`,
        );
        return;
      }
      setLoadedDataset(parsed.data);
    } catch {
      setLoadError('Unable to parse selected file as valid JSON.');
    }
  };

  const maxSignMs = activeDataset
    ? Math.max(...activeDataset.metrics.map((m) => m.signMs), 1)
    : 1;
  const maxVerifyMs = activeDataset
    ? Math.max(...activeDataset.metrics.map((m) => m.verifyMs), 1)
    : 1;
  const maxSigBytes = activeDataset
    ? Math.max(...activeDataset.metrics.map((m) => m.signatureBytes), 1)
    : 1;

  return (
    <div className="space-y-8">
      <SectionHeader
        index="07"
        eyebrow="Reproducible Cryptographic Telemetry"
        title="Cryptographic Benchmarks"
        description="Inspect reproducible ML-DSA-65 vs. ECDSA timing and byte-size measurements loaded from pqc-service or a measured JSON artifact. Qrygent never fabricates performance numbers."
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider cursor-pointer hover:bg-[#1a1c19]">
            <Upload className="w-3.5 h-3.5" />
            Load Measured JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        }
      />

      {loadError ? <ErrorAlert title="Benchmark File Rejected" message={loadError} /> : null}

      {activeDataset ? (
        <div className="space-y-6">
          <PqcDarkCard className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#262924]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#B8F229]" />
                <span className="font-mono text-xs uppercase tracking-wider text-[#B8F229]">
                  Measured Benchmark Dataset
                </span>
              </div>
              <ZoneBadge tone="pqc">Measured · {activeDataset.iterations} iterations</ZoneBadge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
              <div>
                <div className="text-[10px] uppercase text-[#9C9A91]">Libraries</div>
                <div className="text-[#F4F1EA] mt-1">{activeDataset.libraryVersion}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#9C9A91]">Runtime</div>
                <div className="text-[#F4F1EA] mt-1">{activeDataset.runtime}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#9C9A91]">Hardware / CPU</div>
                <div className="text-[#F4F1EA] mt-1">{activeDataset.cpu}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[#9C9A91]">Measured At</div>
                <div className="text-[#F4F1EA] mt-1">{activeDataset.measuredAt}</div>
              </div>
            </div>
            <p className="text-xs text-[#9C9A91] leading-relaxed pt-2 border-t border-[#262924]">
              {activeDataset.notes}
            </p>
          </PqcDarkCard>

          {/* Visual Latency & Payload Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <LedgerCard className="p-5 space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Signing Latency (Mean ms)
              </div>
              {activeDataset.metrics.map((m, idx) => (
                <ComparisonBar
                  key={`sign-${m.algorithm}`}
                  label={m.algorithm}
                  value={m.signMs}
                  max={maxSignMs}
                  unit="ms"
                  accentClass={idx === 0 ? 'bg-[#0D0E0D]' : 'bg-[#2B59C3]'}
                />
              ))}
            </LedgerCard>

            <LedgerCard className="p-5 space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Verification Latency (Mean ms)
              </div>
              {activeDataset.metrics.map((m, idx) => (
                <ComparisonBar
                  key={`verify-${m.algorithm}`}
                  label={m.algorithm}
                  value={m.verifyMs}
                  max={maxVerifyMs}
                  unit="ms"
                  accentClass={idx === 0 ? 'bg-[#2E4A00]' : 'bg-[#2B59C3]'}
                />
              ))}
            </LedgerCard>

            <LedgerCard className="p-5 space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Signature Size (Bytes)
              </div>
              {activeDataset.metrics.map((m, idx) => (
                <ComparisonBar
                  key={`size-${m.algorithm}`}
                  label={m.algorithm}
                  value={m.signatureBytes}
                  max={maxSigBytes}
                  unit="B"
                  accentClass={idx === 0 ? 'bg-[#C81E3A]' : 'bg-[#2B59C3]'}
                />
              ))}
            </LedgerCard>
          </div>

          {/* Exact Measured Table */}
          <LedgerCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#141412]/15 bg-[#F7F5F0] font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                    <th className="py-3 px-6">Algorithm</th>
                    <th className="py-3 px-4">Keygen (ms)</th>
                    <th className="py-3 px-4">Sign (ms)</th>
                    <th className="py-3 px-4">Verify (ms)</th>
                    <th className="py-3 px-4">Public Key (bytes)</th>
                    <th className="py-3 px-6">Signature (bytes)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141412]/10 font-mono text-xs">
                  {activeDataset.metrics.map((m) => (
                    <tr key={m.algorithm}>
                      <td className="py-3.5 px-6 font-semibold text-[#141412]">{m.algorithm}</td>
                      <td className="py-3.5 px-4">{m.keygenMs.toFixed(3)}</td>
                      <td className="py-3.5 px-4">{m.signMs.toFixed(3)}</td>
                      <td className="py-3.5 px-4">{m.verifyMs.toFixed(3)}</td>
                      <td className="py-3.5 px-4">{m.publicKeyBytes.toLocaleString()} B</td>
                      <td className="py-3.5 px-6">{m.signatureBytes.toLocaleString()} B</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </LedgerCard>
        </div>
      ) : (
        <div className="space-y-6">
          {benchmarksQuery.data?.status === 'error' ? (
            <ErrorAlert
              title="Unable to Fetch Measured Benchmarks"
              code={benchmarksQuery.data.code}
              message={benchmarksQuery.data.message}
            />
          ) : benchmarksQuery.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              title="No Measured PQC Benchmark Dataset Loaded Yet"
              reason={benchmarksQuery.data.reason}
              missing={benchmarksQuery.data.missing}
              owner={benchmarksQuery.data.owner}
            />
          ) : null}

          <LedgerCard className="p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#141412]/10">
              <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
                Generate &amp; Load Measured Benchmarks
              </h2>
              <ZoneBadge tone="neutral">Reproducibility Spec</ZoneBadge>
            </div>
            <p className="text-xs text-[#5F5E56] leading-relaxed">
              Run <code>npm --prefix pqc-service run bench</code> to produce{' '}
              <code>pqc-service/benchmarks/latest.json</code> and <code>docs/BENCHMARKS.md</code>,
              then either run <code>pqc-service</code> (served at <code>GET /v1/benchmarks</code>)
              or upload the generated JSON file using the button above.
            </p>
          </LedgerCard>
        </div>
      )}
    </div>
  );
}
