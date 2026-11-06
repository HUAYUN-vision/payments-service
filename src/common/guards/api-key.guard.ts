import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export const API_KEY_HEADER = 'x-api-key';

type RequestWithProject = { headers: Record<string, string | undefined>; project?: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Проверяет `X-API-Key` по API_KEYS и кладёт имя проекта в request.project. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithProject>();
    const provided = req.headers[API_KEY_HEADER];
    if (provided) {
      for (const [project, key] of this.config.get('API_KEYS')) {
        if (safeEqual(provided, key)) {
          req.project = project;
          return true;
        }
      }
    }
    throw new UnauthorizedException('invalid api key');
  }
}

/** Имя проекта, определённое ApiKeyGuard. */
export const CurrentProject = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<RequestWithProject>().project!,
);
