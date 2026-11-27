import { Address } from '@ton/core';
import { deriveUsdtAddresses, ethereumAddressFromSeed, tronAddressFromAccount } from './wallet';

const PASSWORD = 'usdt-wallet-v1-test';

describe('deriveUsdtAddresses', () => {
  it('pins the three addresses for a fixed password', () => {
    const addresses = deriveUsdtAddresses(PASSWORD);
    expect(addresses).toEqual({
      ton: 'UQCSm8yuftis-hKRkt4cMeevPx37C0kGeAOAL65zIl54SFj3',
      ethereum: '0x03A15a4bA10CD3fB3F897279A4C77f4cB20034D5',
      tron: 'TUzoqY6MeeBBx1gkVSSC459NAZMU6cNryp',
    });
    const parsed = Address.parseFriendly(addresses.ton);
    expect(parsed.isBounceable).toBe(false);
    expect(parsed.isTestOnly).toBe(false);
    expect(parsed.address.workChain).toBe(0);
  });

  it('rejects an empty password', () => {
    expect(() => deriveUsdtAddresses('')).toThrow(/empty/);
  });
});

describe('usdt address encoding', () => {
  it('derives the first BIP-44 ethereum account from the well-known seed', () => {
    const seed = Buffer.from(
      '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
      'hex',
    );
    expect(ethereumAddressFromSeed(seed)).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('encodes the TRON USDT contract account', () => {
    const raw = Buffer.from('a614f803b6fd780986a42c78ec9c7f77e6ded13c', 'hex');
    expect(tronAddressFromAccount(raw)).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  });
});
