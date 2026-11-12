// Google OTP 내보내기(otpauth-migration://) 해석·생성. protobuf 를 직접 읽고 쓴다.
import { algorithmFrom, makeDraft, type AccountDraft } from './account';
import type { Algorithm } from './types';

export type MigrationFailure = { source: string; reason: string };
export type MigrationBatch = { size: number; index: number; id: number };

const BATCH_LIMIT = 10;

// ---- protobuf 읽기 ----

type Field = { num: number; wire: number; value: bigint; bytes?: Uint8Array };

class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  private varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new Error('truncated varint');
      const byte = this.buf[this.pos++]!;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return BigInt.asUintN(64, result);
      shift += 7n;
    }
    throw new Error('varint too long');
  }

  private skip(n: number): void {
    if (this.pos + n > this.buf.length) throw new Error('truncated field');
    this.pos += n;
  }

  next(): Field {
    const tag = this.varint();
    const num = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (num < 1) throw new Error('invalid field number');
    switch (wire) {
      case 0:
        return { num, wire, value: this.varint() };
      case 1:
        this.skip(8);
        return { num, wire, value: 0n };
      case 5:
        this.skip(4);
        return { num, wire, value: 0n };
      case 2: {
        const len = this.varint();
        if (len > BigInt(this.buf.length - this.pos)) throw new Error('truncated field');
        const start = this.pos;
        this.pos += Number(len);
        return { num, wire, value: 0n, bytes: this.buf.subarray(start, this.pos) };
      }
      default:
        throw new Error(`unsupported wire type ${wire}`);
    }
  }
}

function toInt(value: bigint): number {
  const signed = BigInt.asIntN(64, value);
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('integer out of range');
  }
  return Number(signed);
}

// ---- protobuf 쓰기 ----

class Writer {
  private readonly out: number[] = [];

  private varint(value: bigint): void {
    let v = BigInt.asUintN(64, value);
    while (v >= 0x80n) {
      this.out.push(Number(v & 0x7fn) | 0x80);
      v >>= 7n;
    }
    this.out.push(Number(v));
  }

  uint(num: number, value: number): this {
    this.varint(BigInt(num << 3));
    this.varint(BigInt(value));
    return this;
  }

  bytes(num: number, data: Uint8Array): this {
    this.varint(BigInt((num << 3) | 2));
    this.varint(BigInt(data.length));
    for (const b of data) this.out.push(b);
    return this;
  }

  string(num: number, text: string): this {
    return this.bytes(num, new TextEncoder().encode(text));
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

// ---- 해석 ----

type Params = {
  secret: Uint8Array;
  name: string;
  issuer: string;
  algorithm: number;
  digits: number;
  type: number;
  counter: number;
};

function readParams(buf: Uint8Array): Params {
  const params: Params = {
    secret: new Uint8Array(0),
    name: '',
    issuer: '',
    algorithm: 0,
    digits: 0,
    type: 0,
    counter: 0,
  };
  const decoder = new TextDecoder();
  const reader = new Reader(buf);
  while (!reader.done) {
    const f = reader.next();
    if (f.wire === 2 && f.bytes) {
      if (f.num === 1) params.secret = f.bytes.slice();
      else if (f.num === 2) params.name = decoder.decode(f.bytes);
      else if (f.num === 3) params.issuer = decoder.decode(f.bytes);
    } else if (f.wire === 0) {
      if (f.num === 4) params.algorithm = toInt(f.value);
      else if (f.num === 5) params.digits = toInt(f.value);
      else if (f.num === 6) params.type = toInt(f.value);
      else if (f.num === 7) params.counter = toInt(f.value);
    }
  }
  return params;
}

function draftFrom(p: Params): AccountDraft {
  const algorithm = algorithmFrom(p.algorithm === 0 ? 1 : p.algorithm);
  let digits: number;
  if (p.digits === 0 || p.digits === 1) digits = 6;
  else if (p.digits === 2) digits = 8;
  else throw new Error(`unsupported digits value: ${p.digits}`);
  let type: 'totp' | 'hotp';
  if (p.type === 0 || p.type === 2) type = 'totp';
  else if (p.type === 1) type = 'hotp';
  else throw new Error(`unsupported type value: ${p.type}`);
  if (type === 'hotp' && p.counter < 0) throw new Error('counter must be non-negative');

  let label = p.name;
  if (p.issuer !== '' && label.startsWith(`${p.issuer}:`)) {
    label = label.slice(p.issuer.length + 1).trimStart();
  }
  return makeDraft({
    type,
    issuer: p.issuer,
    label,
    secret: p.secret,
    algorithm,
    digits,
    period: 30,
    ...(type === 'hotp' ? { counter: p.counter } : {}),
  });
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  if (clean === '' || !/^[A-Za-z0-9+/]+=*$/.test(clean)) throw new Error('invalid base64 data');
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error('invalid base64 data');
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function decodeMigration(uri: string): {
  drafts: AccountDraft[];
  failed: MigrationFailure[];
  batch: MigrationBatch;
} {
  const trimmed = uri.trim();
  const prefix = 'otpauth-migration://';
  if (!trimmed.toLowerCase().startsWith(prefix)) throw new Error('not an otpauth-migration link');
  const q = trimmed.indexOf('?');
  if (q < 0) throw new Error('missing data parameter');
  const data = new URLSearchParams(trimmed.slice(q + 1)).get('data');
  if (data === null) throw new Error('missing data parameter');
  const payload = fromBase64(data);

  const drafts: AccountDraft[] = [];
  const failed: MigrationFailure[] = [];
  const batch: MigrationBatch = { size: 1, index: 0, id: 0 };
  const reader = new Reader(payload);
  let n = 0;
  while (!reader.done) {
    const f = reader.next();
    if (f.num === 1 && f.wire === 2 && f.bytes) {
      n++;
      let source = `#${n}`;
      try {
        const params = readParams(f.bytes);
        source = params.name || source;
        drafts.push(draftFrom(params));
      } catch (e) {
        failed.push({ source, reason: e instanceof Error ? e.message : String(e) });
      }
    } else if (f.wire === 0) {
      if (f.num === 3) batch.size = toInt(f.value);
      else if (f.num === 4) batch.index = toInt(f.value);
      else if (f.num === 5) batch.id = toInt(BigInt.asIntN(32, f.value));
    }
  }
  return { drafts, failed, batch };
}

// ---- 생성 ----

const ALGORITHM_VALUE: Record<Algorithm, number> = { 'SHA-1': 1, 'SHA-256': 2, 'SHA-512': 3 };

function encodeParams(a: AccountDraft): Uint8Array {
  const name = a.issuer !== '' ? `${a.issuer}:${a.label}` : a.label;
  const w = new Writer()
    .bytes(1, a.secret)
    .string(2, name)
    .string(3, a.issuer)
    .uint(4, ALGORITHM_VALUE[a.algorithm])
    .uint(5, a.digits === 8 ? 2 : 1)
    .uint(6, a.type === 'hotp' ? 1 : 2);
  if (a.type === 'hotp') w.uint(7, a.counter ?? 0);
  return w.finish();
}

export function encodeMigration(
  accounts: AccountDraft[],
  batchId: number,
): { uris: string[]; skipped: { label: string; reason: string }[] } {
  const skipped: { label: string; reason: string }[] = [];
  const eligible: AccountDraft[] = [];
  for (const a of accounts) {
    if (a.type !== 'totp' && a.type !== 'hotp') {
      skipped.push({ label: a.label, reason: `type ${a.type} is not supported` });
    } else if (a.digits !== 6 && a.digits !== 8) {
      skipped.push({ label: a.label, reason: `digits ${a.digits} is not supported` });
    } else if (a.period !== 30) {
      skipped.push({ label: a.label, reason: `period ${a.period} is not supported` });
    } else {
      eligible.push(a);
    }
  }

  const size = Math.ceil(eligible.length / BATCH_LIMIT);
  const uris: string[] = [];
  for (let index = 0; index < size; index++) {
    const w = new Writer();
    for (const a of eligible.slice(index * BATCH_LIMIT, (index + 1) * BATCH_LIMIT)) {
      w.bytes(1, encodeParams(a));
    }
    w.uint(2, 1).uint(3, size).uint(4, index).uint(5, batchId);
    uris.push(`otpauth-migration://offline?data=${encodeURIComponent(toBase64(w.finish()))}`);
  }
  return { uris, skipped };
}
