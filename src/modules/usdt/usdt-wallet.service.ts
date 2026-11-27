import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { deriveUsdtAddresses, type UsdtWalletAddresses } from './wallet';

/**
 * Считает адреса приёма один раз при старте.
 * В объекте остаются только публичные строки: пароль и ключ сюда не пишутся.
 */
@Injectable()
export class UsdtWalletService implements OnModuleInit {
  private readonly logger = new Logger(UsdtWalletService.name);
  readonly addresses: UsdtWalletAddresses | null;

  constructor(config: AppConfigService) {
    const password = config.get('USDT_WALLET_PASSWORD');
    this.addresses = password ? deriveUsdtAddresses(password) : null;
  }

  onModuleInit(): void {
    if (!this.addresses) return;
    const { ton, ethereum, tron } = this.addresses;
    this.logger.log(`USDT addresses ton=${ton} ethereum=${ethereum} tron=${tron}`);
  }

  isConfigured(): boolean {
    return this.addresses !== null;
  }
}
