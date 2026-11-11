import "server-only";
import { HDKey } from "viem/accounts";
import { publicKeyToAddress } from "viem/utils";
import { bytesToHex } from "viem";

const P = 2n ** 256n - 2n ** 32n - 977n;
function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n; base %= P;
  for (; exponent > 0n; exponent >>= 1n) { if (exponent & 1n) result = result * base % P; base = base * base % P; }
  return result;
}
/** secp256k1 compressed (33 bytes) -> uncompressed (65 bytes); y = (x^3 + 7)^((p+1)/4) mod p. */
function uncompressed(publicKey: Uint8Array): `0x${string}` {
  if (publicKey.length !== 33 || (publicKey[0] !== 2 && publicKey[0] !== 3)) throw new Error("Wallet derivation failed");
  const x = BigInt(bytesToHex(publicKey.subarray(1)));
  let y = modPow((x ** 3n + 7n) % P, (P + 1n) / 4n);
  if ((y * y) % P !== (x ** 3n + 7n) % P) throw new Error("Wallet derivation failed");
  if ((y & 1n) !== BigInt(publicKey[0] & 1)) y = P - y;
  return `0x04${x.toString(16).padStart(64, "0")}${y.toString(16).padStart(64, "0")}`;
}

// New members receive an address derived from the configured extended public key (BIP32, path m/0/<index>,
// non-hardened). The web server never holds a private key: the master seed is generated offline, sealed with KMS and
// kept by operators (infrastructure/aws/platform/wallet-issuance.md). The address only receives kyaa's on-chain
// records, sent by the relayer; members never sign with it.
export const WALLET_XPUB_PATTERN = /^xpub[1-9A-HJ-NP-Za-km-z]{100,112}$/;
export const MAX_DERIVATION_INDEX = 2_147_483_647;

export function createAddressIssuer(xpub: string) {
  if (!WALLET_XPUB_PATTERN.test(xpub)) throw new Error("Wallet issuance key is invalid");
  const root = HDKey.fromExtendedKey(xpub);
  if (root.privateKey) throw new Error("Wallet issuance must use a public key only");
  const external = root.deriveChild(0);
  return {
    addressAt(index: number): string {
      if (!Number.isSafeInteger(index) || index < 0 || index > MAX_DERIVATION_INDEX) throw new Error("Invalid derivation index");
      const child = external.deriveChild(index);
      if (!child.publicKey) throw new Error("Wallet derivation failed");
      return publicKeyToAddress(uncompressed(child.publicKey)).toLowerCase();
    },
  };
}
