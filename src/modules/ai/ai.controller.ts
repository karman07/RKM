import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

const uid = (req: any) => req.user?.userId || req.user?.sub || req.user?._id;

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  chat(@Body() body: { message: string; session_id?: string }, @Req() req: any) {
    const message = (body?.message ?? '').trim();
    if (!message) throw new BadRequestException('message is required');
    if (message.length > 4000) throw new BadRequestException('Message is too long (max 4000 characters)');
    return this.ai.chat(uid(req), message, body.session_id);
  }

  @Get('sessions')
  sessions(@Req() req: any, @Query('limit') limit?: string) { return this.ai.listSessions(uid(req), Number(limit) || 30); }

  @Get('sessions/:id')
  session(@Param('id') id: string, @Req() req: any) { return this.ai.getSession(uid(req), id); }

  @Delete('sessions/:id')
  remove(@Param('id') id: string, @Req() req: any) { return this.ai.deleteSession(uid(req), id); }

  // ── Tool surface — also consumed by the MCP server (backend/mcp) ─────────────────

  @Get('tools')
  tools() { return this.ai.listTools(); }

  @Post('tools/:name')
  async runTool(@Param('name') name: string, @Body() body: { input?: any }) {
    return { result: await this.ai.runTool(name, body?.input ?? {}) };
  }
}
