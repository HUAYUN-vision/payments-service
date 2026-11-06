import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { WechatCallbackPayload } from './types/wechat.types';
import { WechatService } from './wechat.service';

/** notify_url для WeChat Pay: https://<host>/api/v1/wechat/callback (WECHAT_NOTIFY_URL) */
@ApiExcludeController()
@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Post('callback')
  @HttpCode(200)
  async callback(@Body() body: WechatCallbackPayload) {
    await this.wechatService.handleCallback(body);
    return { code: 'SUCCESS', message: 'OK' };
  }
}
