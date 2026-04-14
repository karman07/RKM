import { Controller, Post, Get, Body, Req, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  async trackEvent(@Body() body: any, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    return this.analyticsService.track({
      ...body,
      userAgent,
      platform: body.platform || 'web',
    });
  }

  @Get('dashboard')
  async getStats(@Query('days') days?: string) {
    return this.analyticsService.getDashboardStats(days ? parseInt(days) : 7);
  }
}
