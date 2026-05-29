import { Controller, Post, Delete, Get, Body, UseGuards, Request, Query, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IsString, IsOptional } from 'class-validator';

class RegisterTokenDto {
  @IsString()
  token: string;
}

class SendTestDto {
  @IsString()
  userId: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  type?: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Register FCM token — called from browser after token is obtained */
  @Post('register-token')
  async register(@Request() req: any, @Body() body: RegisterTokenDto) {
    const user = req.user;
    const branchId =
      user.branch_id ||
      (user.branch as any)?._id?.toString() ||
      (typeof user.branch === 'string' ? user.branch : null);
    await this.notificationsService.registerToken(
      user.userId || user._id || user.sub,
      body.token,
      user.role,
      branchId || undefined,
    );
    return { success: true, branch_id: branchId, role: user.role };
  }

  /** Remove a token on logout */
  @Delete('remove-token')
  async remove(@Body() body: RegisterTokenDto) {
    await this.notificationsService.removeToken(body.token);
    return { success: true };
  }

  /**
   * Get notification history for the current user.
   * Admins see admin-targeted, managers see their branch notifications.
   */
  @Get('my')
  async getMy(@Request() req: any) {
    const user = req.user;
    const branchId =
      user.branch_id ||
      (user.branch as any)?._id?.toString() ||
      (typeof user.branch === 'string' ? user.branch : null);
    const userId = user.userId || user._id || user.sub;
    return this.notificationsService.getForUser(user.role, userId, branchId || undefined);
  }

  @Post('read-all')
  async markAllRead(@Request() req: any) {
    const user = req.user;
    const branchId =
      user.branch_id ||
      (user.branch as any)?._id?.toString() ||
      (typeof user.branch === 'string' ? user.branch : null);
    const userId = user.userId || user._id || user.sub;
    await this.notificationsService.markAllAsRead(user.role, userId, branchId || undefined);
    return { success: true };
  }

  @Post(':id/read')
  async markRead(@Request() req: any, @Param('id') id: string) {
    const user = req.user;
    const userId = user.userId || user._id || user.sub;
    await this.notificationsService.markAsRead(id, userId);
    return { success: true };
  }

  /** Admin: get full sent-notification history */
  @Get('sent')
  async getSent(@Request() req: any, @Query('limit') limit?: string) {
    if (req.user?.role !== 'admin') return [];
    return this.notificationsService.getSentHistory(limit ? parseInt(limit, 10) : 100);
  }

  /** Admin: list all registered push tokens */
  @Get('tokens')
  async getTokens(@Request() req: any) {
    if (req.user?.role !== 'admin') return [];
    return this.notificationsService.getRegisteredTokens();
  }

  /** Admin: send a test notification to a specific user */
  @Post('send-test')
  async sendTest(@Request() req: any, @Body() body: SendTestDto) {
    if (req.user?.role !== 'admin') return { success: false, error: 'Forbidden' };
    await this.notificationsService.sendToUser(
      body.userId,
      body.title,
      body.body,
      { type: body.type || 'test' },
    );
    return { success: true };
  }

  /** Admin: broadcast to all managers */
  @Post('broadcast-managers')
  async broadcastManagers(@Request() req: any, @Body() body: { title: string; body: string; type?: string }) {
    if (req.user?.role !== 'admin') return { success: false, error: 'Forbidden' };
    await this.notificationsService.notifyAllManagers(body.title, body.body, { type: body.type || 'test' });
    return { success: true };
  }
}
