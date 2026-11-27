import { createHmac, pbkdf2Sync } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha2';
import { HDKey } from '@scure/bip32';
import { createBase58check } from '@scure/base';
import { beginCell, Cell, contractAddress } from '@ton/core';

const SALT = 'payments-service:usdt:v1';
const PBKDF2_ITERATIONS = 210_000;
const SEED_LENGTH = 64;
/** Ключ HMAC — seed, сообщение — эта метка. Порядок фиксирует адрес TON. */
const TON_HMAC_LABEL = 'ton-wallet-v4r2-v1';
/** v4R2 на workchain 0: id по умолчанию, 698983191 + workchain. */
const TON_WALLET_ID = 698983191;
const HARDENED = 0x80000000;
const ETH_PATH = [44 + HARDENED, 60 + HARDENED, HARDENED, 0, 0];
const TRON_PATH = [44 + HARDENED, 195 + HARDENED, HARDENED, 0, 0];

/**
 * Код Wallet v4R2. Адрес — хеш StateInit: этот код и data с публичным ключом.
 * Строка из эталонного контракта v4R2, чтобы адрес не поехал при обновлении библиотек.
 */
const TON_V4R2_CODE = Cell.fromBase64(
  'te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA==',
);

const encodeTron = createBase58check(sha256);

export type UsdtWalletAddresses = {
  ton: string;
  ethereum: string;
  tron: string;
};

/** Три публичных адреса приёма USDT. Приватный ключ наружу не возвращается. */
export function deriveUsdtAddresses(password: string): UsdtWalletAddresses {
  if (!password) throw new Error('USDT wallet password is empty');

  const seed = pbkdf2Sync(password, SALT, PBKDF2_ITERATIONS, SEED_LENGTH, 'sha512');
  try {
    return {
      ton: tonAddress(seed),
      ethereum: ethereumAddressFromSeed(seed),
      tron: tronAddress(seed),
    };
  } finally {
    seed.fill(0);
  }
}

function tonAddress(seed: Uint8Array): string {
  const mac = createHmac('sha512', seed).update(TON_HMAC_LABEL).digest();
  try {
    const publicKey = ed25519.getPublicKey(mac.subarray(0, 32));
    return tonV4R2Address(publicKey);
  } finally {
    mac.fill(0);
  }
}

function tonV4R2Address(publicKey: Uint8Array): string {
  const data = beginCell()
    .storeUint(0, 32)
    .storeUint(TON_WALLET_ID, 32)
    .storeBuffer(Buffer.from(publicKey))
    .storeBit(0)
    .endCell();
  return contractAddress(0, { code: TON_V4R2_CODE, data }).toString({
    bounceable: false,
    urlSafe: true,
  });
}

/** m/44'/60'/0'/0/0, checksum EIP-55. */
export function ethereumAddressFromSeed(seed: Uint8Array): string {
  return eip55(addressBytes(compressedPublicKey(seed, ETH_PATH)));
}

function tronAddress(seed: Uint8Array): string {
  return tronAddressFromAccount(addressBytes(compressedPublicKey(seed, TRON_PATH)));
}

/** Base58Check от 0x41 и 20 байт счёта. */
export function tronAddressFromAccount(raw20: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(raw20, 1);
  return encodeTron.encode(payload);
}

/** Последние 20 байт keccak256 несжатого публичного ключа. */
function addressBytes(compressedPublicKey: Uint8Array): Uint8Array {
  const uncompressed = secp256k1.Point.fromHex(compressedPublicKey).toRawBytes(false);
  const hash = keccak_256(uncompressed.subarray(1));
  return hash.subarray(hash.length - 20);
}

function eip55(raw: Uint8Array): string {
  const hex = Buffer.from(raw).toString('hex');
  const hashHex = Buffer.from(keccak_256(new TextEncoder().encode(hex))).toString('hex');
  let out = '0x';
  for (let i = 0; i < hex.length; i++) {
    const char = hex[i];
    out += Number.parseInt(hashHex[i], 16) >= 8 ? char.toUpperCase() : char;
  }
  return out;
}

/**
 * Идёт по пути BIP-32 и сразу стирает приватный ключ каждого узла.
 * Наружу уходит только копия сжатого публичного ключа.
 */
function compressedPublicKey(seed: Uint8Array, indexes: readonly number[]): Uint8Array {
  let node = HDKey.fromMasterSeed(seed);
  try {
    for (const index of indexes) {
      const child = node.deriveChild(index);
      wipeHd(node);
      node = child;
    }
    const publicKey = node.publicKey;
    if (!publicKey) throw new Error('HD key has no public key');
    return Uint8Array.from(publicKey);
  } finally {
    wipeHd(node);
  }
}

function wipeHd(key: HDKey): void {
  key.wipePrivateData();
  key.chainCode?.fill(0);
}
