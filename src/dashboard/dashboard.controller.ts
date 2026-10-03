import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Serves the staff dispatch dashboard as a single static page (no build
 * step, no framework) — see dashboard.html. The page itself is public; all
 * data access goes through /orders, gated by ApiKeyGuard.
 */
@Controller('dashboard')
export class DashboardController {
  private readonly html = readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(): string {
    return this.html;
  }
}
