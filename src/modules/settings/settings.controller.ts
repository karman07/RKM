import { Body, Controller, Get, Put, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings/public — no auth. A safe, minimal subset of settings for the
   * public storefront (frontend). Never add pricing/HR/security fields here —
   * only flags that are fine for anyone to read.
   */
  @Get('public')
  async getPublic() {
    const settings = await this.settingsService.get();
    return {
      dev_banner_enabled: settings.dev_banner_enabled,
      location_enforcement_enabled: settings.location_enforcement_enabled !== false,
      // effective on/off per login role (a role not set individually follows the master value)
      location_enforcement_roles: Object.fromEntries(
        ['manager', 'cashier', 'sales', 'custom'].map((r) => [
          r,
          typeof settings.location_enforcement_roles?.[r] === 'boolean'
            ? settings.location_enforcement_roles[r]
            : settings.location_enforcement_enabled !== false,
        ]),
      ),
    };
  }

  /** Any authenticated role can read settings (cashier needs gold rate too) */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  get() {
    return this.settingsService.get();
  }

  /** Only admin and manager can update settings */
  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
