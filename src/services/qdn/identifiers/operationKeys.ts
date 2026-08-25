// ===== Operation Key Helpers =====
//
// Deterministic, domain-separated, collision-resistant key derivation
// for reaction and tombstone identifiers.
//
// Uses SHA-256 with canonical domain prefixes.
// Every operation key provides 104 bits (26 lowercase hex characters).
//
// Core constraint: ArbitraryTransaction.MAX_IDENTIFIER_LENGTH = 64
// (verified from ArbitraryTransaction.java:60)
//
//   Reaction:  qucp-r-{26hex}-{26hex}  = 63 chars
//   Tombstone: qucp-ot-{26hex}-{26hex} = 64 chars

const ENCODER = new TextEncoder();

/** Shared operation-key hex length — 104 bits per key. */
export const OPERATION_KEY_HEX_LENGTH = 26;

/** Verified Core MAX_IDENTIFIER_LENGTH from ArbitraryTransaction.java:60. */
export const QDN_MAX_IDENTIFIER_LENGTH = 64;

async function sha256Hex(input: string): Promise<string> {
  const data = ENCODER.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const WALLET_RE = /^Q[A-Za-z0-9]+$/;
function checkWallet(addr: string): void {
  if (!WALLET_RE.test(addr) || addr.length < 33 || addr.length > 36) {
    throw new Error(`Invalid wallet: ${addr.slice(0, 8)}...`);
  }
}

// ---- Reaction Keys ----

export async function buildReactionActorKey(addr: string): Promise<string> {
  checkWallet(addr);
  return (await sha256Hex(`qucp:v1:actor:${addr}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function buildReactionTargetKey(family: string, entityId: string): Promise<string> {
  return (await sha256Hex(`qucp:v1:target:${family}:${entityId}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyReactionActorKey(key: string, addr: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildReactionActorKey(addr);
}

export async function verifyReactionTargetKey(key: string, family: string, entityId: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildReactionTargetKey(family, entityId);
}

// ---- Tombstone Keys ----

export async function buildTombstoneOwnerKey(addr: string): Promise<string> {
  checkWallet(addr);
  return (await sha256Hex(`qucp:v1:owner:${addr}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function buildTombstoneTargetKey(family: string, entityId: string): Promise<string> {
  return (await sha256Hex(`qucp:v1:target:${family}:${entityId}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyTombstoneOwnerKey(key: string, addr: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildTombstoneOwnerKey(addr);
}

export async function verifyTombstoneTargetKey(key: string, family: string, entityId: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildTombstoneTargetKey(family, entityId);
}

// ---- Support Ticket Close Keys ----

export async function buildTicketCloseActorKey(addr: string): Promise<string> {
  checkWallet(addr);
  return (await sha256Hex(`qucp:v1:ticket-close:actor:${addr}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function buildTicketCloseTargetKey(family: string, entityId: string): Promise<string> {
  return (await sha256Hex(`qucp:v1:ticket-close:target:${family}:${entityId}`)).slice(0, OPERATION_KEY_HEX_LENGTH);
}

export async function verifyTicketCloseActorKey(key: string, addr: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildTicketCloseActorKey(addr);
}

export async function verifyTicketCloseTargetKey(key: string, family: string, entityId: string): Promise<boolean> {
  return key.length === OPERATION_KEY_HEX_LENGTH && key === await buildTicketCloseTargetKey(family, entityId);
}
