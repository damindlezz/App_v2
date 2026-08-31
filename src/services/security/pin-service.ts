const ITERATIONS = 160_000;
const HASH = 'SHA-256';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizePin(pin: string): string {
  return pin.trim();
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.slice().buffer,
      iterations: ITERATIONS,
      hash: HASH
    },
    keyMaterial,
    256
  );

  return toBase64(new Uint8Array(bits));
}

export async function createPinCredential(pin?: string): Promise<{ pinHash: string | null; pinSalt: string | null }> {
  const normalized = normalizePin(pin ?? '');
  if (!normalized) {
    return { pinHash: null, pinSalt: null };
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    pinHash: await derivePinHash(normalized, salt),
    pinSalt: toBase64(salt)
  };
}

export async function verifyPin(pin: string, pinHash: string | null, pinSalt: string | null): Promise<boolean> {
  if (pinHash === null && pinSalt === null) return true;
  if (!pinHash || !pinSalt) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(pinSalt);
    expected = fromBase64(pinHash);
  } catch {
    return false;
  }

  const candidate = fromBase64(await derivePinHash(normalizePin(pin), salt));
  if (candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= (candidate[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}
