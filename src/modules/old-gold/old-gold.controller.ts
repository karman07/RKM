import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OldGoldService } from './old-gold.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permission } from '../../auth/decorators/permissions.decorator';
import { OG } from './old-gold.permissions';

/**
 * All routes are protected by JwtAuthGuard (authentication) and
 * PermissionsGuard (authorization).
 *
 * No role names appear here — access is entirely driven by the OG.* keys
 * that live in CustomRole.sidebar_permissions (or the built-in role defaults
 * defined in PermissionsGuard).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('old-gold')
export class OldGoldController {
  constructor(private readonly service: OldGoldService) {}

  // ── Queries ──────────────────────────────────────────────────────────────────

  /** Lists transactions.  VIEW_ALL users see every branch; VIEW_BRANCH users see only theirs. */
  @Get()
  @Permission(OG.VIEW_BRANCH)
  list(@Req() req: any) {
    return this.service.findAll(req.user);
  }

  @Get(':id')
  @Permission(OG.VIEW_BRANCH)
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  // ── Lifecycle mutations ───────────────────────────────────────────────────────

  @Post()
  @Permission(OG.CREATE)
  create(@Body() body: any, @Req() req: any) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  @Permission(OG.EDIT)
  edit(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.edit(id, body, req.user);
  }

  @Post(':id/submit')
  @Permission(OG.SUBMIT)
  submit(@Param('id') id: string, @Req() req: any) {
    return this.service.submit(id, req.user);
  }

  @Post(':id/approve')
  @Permission(OG.APPROVE)
  approve(@Param('id') id: string, @Req() req: any) {
    return this.service.approve(id, req.user);
  }

  @Post(':id/reject')
  @Permission(OG.REJECT)
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.reject(id, body, req.user);
  }

  @Post(':id/authorize-melt')
  @Permission(OG.AUTHORIZE_MELT)
  authorizeMelt(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.authorizeMelt(id, body, req.user);
  }

  @Post(':id/settle')
  @Permission(OG.SETTLE)
  settle(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.settle(id, body, req.user);
  }

  @Post(':id/reverse')
  @Permission(OG.REVERSE_SETTLEMENT)
  reverse(@Param('id') id: string, @Req() req: any) {
    return this.service.reverseSettlement(id, req.user);
  }
}
