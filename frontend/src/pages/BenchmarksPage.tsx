import { useState, type ChangeEvent } from 'react';
import { z } from 'zod';
import { Gauge, Upload } from 'lucide-react';
import type { BenchmarkDataset } from '../domain/types';
import { useBenchmarks } from '../hooks/useQrygentData';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

const benchmarkDatasetSchema = z.object({
  measured: z.literal(true),
  library: z.string().min(1),
  libraryVersion: z.string().min(1),
  runtime: z.string().min(1),
  cpu: z.string().min(1),
  iterations: z.number().int().positive(),
  measuredAt: z.string().min(1),
  notes: z.string(),
  metrics: z
    .array(
      z.object({
        algorithm: z.string().min(1),
        keygenMs: z.number().nonnegative(),
        signMs: z.number().nonnegative(),
        verifyMs: z.number().nonnegative(),
        publicKeyBytes: z.number().int().positive(),
        signatureBytes: z.number().int().positive(),
      }),
    )
    .min(1),
});

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

  return (
    <div className="space-y-8">
      <SectionHeader
        index="07"
        eyebrow="Reproducible Cryptographic Telemetry"
        title="Cryptographic Benchmarks"
        description="Inspect reproducible ML-DSA-65 vs. ECDSA timing and byte-size measurements. Qrygent never fabricates performance numbers or claims universal superiority from incomplete runs."
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
          {/* Provenance Metadata */}
          <PqcDarkCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#262924]">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#B8F229]" />
                <span className="font-mono text-xs uppercase tracking-wider text-[#B8F229]">
                  Measured Benchmark Dataset Loaded
                </span>
              </div>
              <ZoneBadge tone="pqc">Measured · {activeDataset.iterations} iterations</ZoneBadge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 font-mono text-xs">
              <div>
                <div className="text-[10px] uppercase text-[#9C9A91]">Library</div>
                <div className="text-[#F4F1EA] mt-1">
                  {activeDataset.library}@{activeDataset.libraryVersion}
                </div>
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
          </PqcDarkCard>

          {/* Measured Comparison Table */}
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
          {benchmarksQuery.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              title="No Measured PQC Benchmark Dataset Available Yet"
              reason={benchmarksQuery.data.reason}
              missing={benchmarksQuery.data.missing}
              owner={benchmarksQuery.data.owner}
            />
          ) : null}

          <LedgerCard className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#141412]/10">
              <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
                Expected Measured Benchmark Artifact Schema
              </h2>
              <ZoneBadge tone="neutral">Reproducibility Spec</ZoneBadge>
            </div>
            <p className="text-xs text-[#5F5E56] leading-relaxed">
              Per <code>docs/SECURITY.md</code> §2 &amp; §6, benchmarks must record the exact
              cryptographic library, version, runtime, CPU, and iteration count, and must not be
              used to claim universal security or speed superiority. Once the PQC benchmark script
              outputs a JSON artifact matching the schema below, you can upload it above or serve it
              from the PQC service.
            </p>
            <pre className="p-4 bg-[#0D0E0D] text-[#F4F1EA] font-mono text-[11px] overflow-x-auto rounded-[2px]">{`{
  "measured": true,
  "library": "<e.g. @noble/post-quantum or liboqs>",
  "libraryVersion": "<semver>",
  "runtime": "<Node / Python version>",
  "cpu": "<CPU model>",
  "iterations": 1000,
  "measuredAt": "2026-11-25T00:00:00Z",
  "notes": "Methodology & build flags",
  "metrics": [
    {
      "algorithm": "ML-DSA-65",
      "keygenMs": 0.0,
      "signMs": 0.0,
      "verifyMs": 0.0,
      "publicKeyBytes": 1952,
      "signatureBytes": 3309
    }
  ]
}`}</pre>
          </LedgerCard>
        </div>
      )}
    </div>
  );
}
