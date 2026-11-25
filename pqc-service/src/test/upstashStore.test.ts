import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hex } from 'viem';
import { UpstashRedisRegistryStore } from '../store/upstashStore.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpstashRedisRegistryStore REST adapter', () => {
  it('executes HSET/HGETALL, atomic SET NX nonce claim, and LPUSH/LRANGE audit events over REST', async () => {
    const hash = new Map<string, string>();
    const kv = new Map<string, string>();
    const list: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const cmd = JSON.parse(String(init?.body ?? '[]')) as string[];
      const op = cmd[0];
      let result: unknown = null;

      if (op === 'HGET') {
        result = hash.get(cmd[2]!) ?? null;
      } else if (op === 'HSET') {
        hash.set(cmd[2]!, cmd[3]!);
        result = 1;
      } else if (op === 'HGETALL') {
        const flat: string[] = [];
        for (const [k, v] of hash.entries()) flat.push(k, v);
        result = flat;
      } else if (op === 'GET') {
        result = kv.get(cmd[1]!) ?? null;
      } else if (op === 'SET') {
        const key = cmd[1]!;
        const val = cmd[2]!;
        const nx = cmd[3] === 'NX';
        if (nx && kv.has(key)) {
          result = null;
        } else {
          kv.set(key, val);
          result = 'OK';
        }
      } else if (op === 'LPUSH') {
        list.unshift(cmd[2]!);
        result = list.length;
      } else if (op === 'LTRIM') {
        const max = Number(cmd[3]) + 1;
        list.length = Math.min(list.length, max);
        result = 'OK';
      } else if (op === 'LRANGE') {
        const end = Number(cmd[3]) + 1;
        result = list.slice(0, end);
      }

      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const store = new UpstashRedisRegistryStore('https://example.upstash.io/', 'test-token');
    expect(store.storageMode).toBe('upstash_redis');

    const agentId = `0x${'aa'.repeat(32)}` as Hex;
    const keyId = `0x${'11'.repeat(32)}` as Hex;
    const nonce = `0x${'55'.repeat(32)}` as Hex;

    await store.registerAgent({
      agentId,
      label: 'Serverless Agent',
      owner: '0x1111111111111111111111111111111111111111',
      keyId,
      publicKeyHex: `0x${'22'.repeat(1952)}`,
      fingerprint: 'sha256:abcd1234',
      nowUnix: 1800000000,
    });

    const agents = await store.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.label).toBe('Serverless Agent');

    // Atomic SET NX claims nonce once and rejects concurrent replay
    expect(await store.claimNonce(nonce, 'req_1', 1800000000)).toBe(true);
    expect(await store.claimNonce(nonce, 'req_2', 1800000001)).toBe(false);
    expect(await store.isNonceConsumed(nonce)).toBe(true);

    const events = await store.listSecurityEvents(10);
    expect(events.some((e) => e.code === 'KEY_REGISTERED')).toBe(true);
  });
});
