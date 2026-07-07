import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { GoldLoanService } from './gold-loan.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permission } from '../../auth/decorators/permissions.decorator';
import { GL } from './gold-loan.permissions';
import { multerDocConfig } from '../uploads/multer.config';

/**
 * All routes are protected by JwtAuthGuard (authentication) and
 * PermissionsGuard (authorization). Access is entirely driven by the GL.* keys
 * that live in CustomRole.sidebar_permissions (or the built-in manager defaults
 * defined in PermissionsGuard).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gold-loan')
export class GoldLoanController {
  constructor(private readonly service: GoldLoanService) {}

  // ── Queries ──────────────────────────────────────────────────────────────────

  /** Lists loans. VIEW_ALL users see every branch; VIEW_BRANCH users see only theirs. */
  @Get()
  @Permission(GL.VIEW_BRANCH)
  list(@Req() req: any) {
    return this.service.findAll(req.user);
  }

  /** Loans for a specific customer — used by the admin customer 360 page */
  @Get('customer/:customerId')
  @Permission(GL.VIEW_BRANCH)
  listByCustomer(@Param('customerId') customerId: string) {
    return this.service.findByCustomer(customerId);
  }

  @Get('export/catalog')
  @Permission(GL.EXPORT)
  async exportCatalog(@Req() req: any, @Res() res: Response) {
    const buffer = await this.service.exportCatalog(req.user);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="gold-loan-catalog.xlsx"',
    });
    res.send(buffer);
  }

  @Get(':id')
  @Permission(GL.VIEW_BRANCH)
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  // ── Lifecycle mutations ───────────────────────────────────────────────────────

  @Post()
  @Permission(GL.CREATE)
  create(@Body() body: any, @Req() req: any) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  @Permission(GL.EDIT)
  edit(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.edit(id, body, req.user);
  }

  @Post(':id/submit')
  @Permission(GL.SUBMIT)
  submit(@Param('id') id: string, @Req() req: any) {
    return this.service.submit(id, req.user);
  }

  @Post(':id/approve')
  @Permission(GL.APPROVE)
  approve(@Param('id') id: string, @Req() req: any) {
    return this.service.approve(id, req.user);
  }

  @Post(':id/reject')
  @Permission(GL.REJECT)
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.reject(id, body, req.user);
  }

  @Post(':id/mark-emi')
  @Permission(GL.MARK_EMI)
  markEmi(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.markEmi(id, body, req.user);
  }

  @Post(':id/close')
  @Permission(GL.CLOSE)
  close(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.close(id, body, req.user);
  }

  // ── Pledge agreement form ─────────────────────────────────────────────────────

  @Post(':id/generate-form')
  @Permission(GL.MANAGE_FORM)
  generateForm(@Param('id') id: string, @Req() req: any) {
    return this.service.generateForm(id, req.user);
  }

  @Post(':id/signed-form')
  @Permission(GL.MANAGE_FORM)
  @UseInterceptors(FileInterceptor('file', multerDocConfig('gold-loan-forms')))
  uploadSignedForm(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.attachSignedForm(id, file, req.user);
  }

  // ── Closure certificate ────────────────────────────────────────────────────────

  @Post(':id/generate-closure-certificate')
  @Permission(GL.MANAGE_FORM)
  generateClosureCertificate(@Param('id') id: string, @Req() req: any) {
    return this.service.generateClosureCertificate(id, req.user);
  }

  @Post(':id/signed-closure-certificate')
  @Permission(GL.MANAGE_FORM)
  @UseInterceptors(FileInterceptor('file', multerDocConfig('gold-loan-forms')))
  uploadSignedClosureCertificate(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.attachSignedClosureCertificate(id, file, req.user);
  }
}
