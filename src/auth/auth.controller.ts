import {
  Controller, Post, Body, HttpCode, HttpStatus,
  Get, UseGuards, Request, Param, Patch, Query, Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  /** Step 1 — password login. Always requires email + password before WebAuthn fingerprint step. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto, @Req() req: any) {
    loginDto.ip_address =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress || '';
    return this.authService.login(loginDto);
  }

  /** Step 2a — registration: generate options (first-time, uses setup_token) */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/registration-options')
  @HttpCode(HttpStatus.OK)
  async getRegistrationOptions(@Request() req) {
    const userId = String(req.user.userId || req.user.sub);
    const user = await this.usersService.findById(userId);
    return this.authService.generateRegistrationOptions(user);
  }

  /** Step 2b — registration: verify and store credential */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register')
  @HttpCode(HttpStatus.OK)
  async register(@Request() req, @Body() body: { registration_response: any }, @Req() rawReq: any) {
    const userId = String(req.user.userId || req.user.sub);
    const ip =
      (rawReq.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      rawReq.socket?.remoteAddress || '';
    return this.authService.verifyAndStoreCredential(userId, body.registration_response, ip);
  }

  /** Step 3a — authentication: generate options (uses pending_token) */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/authentication-options')
  @HttpCode(HttpStatus.OK)
  async getAuthenticationOptions(@Request() req) {
    const userId = String(req.user.userId || req.user.sub);
    const user = await this.usersService.findById(userId);
    return this.authService.generateAuthenticationOptions(user);
  }

  /** Step 3b — authentication: verify assertion and issue full JWT */
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticate(@Request() req, @Body() body: { authentication_response: any }, @Req() rawReq: any) {
    const userId = String(req.user.userId || req.user.sub);
    const ip =
      (rawReq.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      rawReq.socket?.remoteAddress || '';
    return this.authService.verifyAndLogin(userId, body.authentication_response, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    return this.usersService.findById(req.user.userId || req.user.sub);
  }

  /** Admin: list all staff login sessions */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('login-sessions')
  getLoginSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: string,
  ) {
    return this.authService.getLoginSessions(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      role,
    );
  }

  /** Admin: list breach attempts */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('security-breaches')
  getSecurityBreaches(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreviewed_only') unreviewed_only?: string,
  ) {
    return this.authService.getSecurityBreaches(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      unreviewed_only === 'true',
    );
  }

  /** Admin: mark a breach reviewed */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('security-breaches/:id/review')
  reviewBreach(@Param('id') id: string) {
    return this.authService.reviewBreach(id);
  }
}
