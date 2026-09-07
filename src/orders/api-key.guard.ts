import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';

/**
 * Guards the orders feed with a static API key sent as `x-api-key`.
 * Good enough for a single internal consumer (staff dashboard, phase 2);
 * swap for real auth once there are multiple staff identities.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('adminApiKey', { infer: true });
    if (!expected) {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key') ?? '';

    if (!timingSafeEqualStrings(provided, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
