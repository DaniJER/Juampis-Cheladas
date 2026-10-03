import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestWithBusiness extends Request {
  businessId: string;
}

/**
 * Guards the orders feed with a per-business API key sent as `x-api-key`,
 * looked up against Business.adminApiKey. Attaches the resolved businessId
 * to the request so the controller/service can scope every query to it.
 * Good enough for one internal consumer per business (staff dashboard);
 * swap for real auth once there are multiple staff identities per business.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBusiness>();
    const provided = request.header('x-api-key') ?? '';
    if (!provided) {
      throw new UnauthorizedException('Missing x-api-key');
    }

    const businesses = await this.prisma.business.findMany({
      where: { isActive: true },
      select: { id: true, adminApiKey: true },
    });
    const match = businesses.find((b) => timingSafeEqualStrings(provided, b.adminApiKey));
    if (!match) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.businessId = match.id;
    return true;
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
