import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import { UsdtWalletService } from './usdt-wallet.service';
import { deriveUsdtAddresses } from './wallet';

jest.mock('./wallet', () => ({
  deriveUsdtAddresses: jest.fn(),
}));

const derive = jest.mocked(deriveUsdtAddresses);

describe('UsdtWalletService', () => {
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const addresses = {
    ton: 'UQ_ton',
    ethereum: '0xEth',
    tron: 'Ttron',
  };

  afterEach(() => {
    log.mockClear();
    derive.mockReset();
  });

  afterAll(() => log.mockRestore());

  function service(password: string | undefined): UsdtWalletService {
    const env: Record<string, unknown> = { USDT_WALLET_PASSWORD: password };
    const config = { get: (key: string) => env[key] } as unknown as AppConfigService;
    return new UsdtWalletService(config);
  }

  it('stays unconfigured when the password is empty', () => {
    const wallet = service(undefined);
    wallet.onModuleInit();

    expect(wallet.isConfigured()).toBe(false);
    expect(wallet.addresses).toBeNull();
    expect(derive).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('logs the three addresses and does not keep the password', () => {
    derive.mockReturnValue(addresses);
    const password = 'secret-password-not-for-logs';
    const wallet = service(password);
    wallet.onModuleInit();

    expect(derive).toHaveBeenCalledWith(password);
    expect(wallet.addresses).toEqual(addresses);
    expect(wallet.isConfigured()).toBe(true);
    expect(log).toHaveBeenCalledWith('USDT addresses ton=UQ_ton ethereum=0xEth tron=Ttron');
    expect(JSON.stringify(wallet)).not.toContain(password);
    expect(wallet).not.toHaveProperty('privateKey');
  });
});
