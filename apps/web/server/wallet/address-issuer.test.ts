import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { HDKey, hdKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { createAddressIssuer } from "./address-issuer";

// Public BIP39 test vector mnemonic; never a real key.
// BIP39 seed of MNEMONIC (empty passphrase).
const SEED_HEX = "9dfc3c64c2f8bede1533b6a79f8570e5943e0b8fd1cf77107adf7b72cef42185d564a3aee24cab43f80e3c4538087d70fc824eabbad596a23c97b6ee8322ccc0";
const MNEMONIC = "test test test test test test test test test test test junk";
const root = HDKey.fromMasterSeed(new Uint8Array(32).fill(7));
const account = root.derive("m/44'/60'/0'");

describe("createAddressIssuer", () => {
  it("derives the same addresses as the private key path, from the public key alone", () => {
    const issuer = createAddressIssuer(account.publicExtendedKey);
    expect(issuer.addressAt(0)).toBe(hdKeyToAccount(root, { addressIndex: 0 }).address.toLowerCase());
    expect(issuer.addressAt(7)).toBe(hdKeyToAccount(root, { addressIndex: 7 }).address.toLowerCase());
    // Known vector: hardhat's public test mnemonic, index 0.
    const vector = HDKey.fromMasterSeed(Uint8Array.from(Buffer.from(SEED_HEX, "hex"))).derive("m/44'/60'/0'");
    expect(createAddressIssuer(vector.publicExtendedKey).addressAt(0)).toBe(mnemonicToAccount(MNEMONIC).address.toLowerCase());
    expect(issuer.addressAt(1)).not.toBe(issuer.addressAt(2));
  });
  it("refuses a private extended key and bad indexes", () => {
    expect(() => createAddressIssuer(account.privateExtendedKey)).toThrow();
    expect(() => createAddressIssuer(account.publicExtendedKey).addressAt(-1)).toThrow();
    expect(() => createAddressIssuer(account.publicExtendedKey).addressAt(2 ** 31)).toThrow();
  });
});
