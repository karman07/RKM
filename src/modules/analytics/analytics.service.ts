import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsEvent } from './schemas/event.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private eventModel: Model<AnalyticsEvent>,
  ) {}

  async track(eventData: any) {
    const newEvent = new this.eventModel(eventData);
    return newEvent.save();
  }

  async getDashboardStats(days = 7) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      pageViews, 
      topProducts, 
      cartStats, 
      chatbotStats, 
      uniqueVisitors, 
      sessionStats,
      pagePerformance,
      cartOverTime,
      geoStats,
      sourceStats,
      chatbotVelocity
    ] = await Promise.all([
      this.getPageViewsOverTime(since),
      this.getTopProducts(since),
      this.getCartStats(since),
      this.getChatbotStats(since),
      this.getUniqueVisitorCount(since),
      this.getSessionTimeStats(since),
      this.getPagePerformance(since),
      this.getCartAddsOverTime(since),
      this.getGeographicStats(since),
      this.getSourceStats(since),
      this.getChatbotVelocity(since),
    ]);

    return {
      pageViews,
      topProducts,
      cartStats,
      chatbotStats,
      uniqueVisitors,
      avgSessionTime: sessionStats[0]?.avgDuration || 0,
      pagePerformance,
      cartOverTime,
      geoStats,
      sourceStats,
      chatbotVelocity
    };
  }

  private async getPageViewsOverTime(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'pageview', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          views: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  private async getTopProducts(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'view_product', createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$properties.productName',
          views: { $sum: 1 },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]);
  }

  private async getCartStats(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'add_to_cart', createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$properties.productName',
          adds: { $sum: 1 },
        },
      },
      { $sort: { adds: -1 } },
      { $limit: 10 },
    ]);
  }

  private async getChatbotStats(since: Date) {
    const totalInteractions = await this.eventModel.countDocuments({ 
      type: 'chatbot_interaction', 
      createdAt: { $gte: since } 
    });
    const uniqueUsers = await this.eventModel.distinct('sessionId', { 
      type: 'chatbot_interaction', 
      createdAt: { $gte: since } 
    });
    return {
      total: totalInteractions,
      users: uniqueUsers.length,
    };
  }

  private async getUniqueVisitorCount(since: Date) {
    const visitors = await this.eventModel.distinct('sessionId', { createdAt: { $gte: since } });
    return visitors.length;
  }

  private async getSessionTimeStats(since: Date) {
    return this.eventModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$sessionId',
          start: { $min: '$createdAt' },
          end: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          duration: { $subtract: ['$end', '$start'] },
        },
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' },
        },
      },
    ]);
  }

  private async getPagePerformance(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'pageview', createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$pathname',
          views: { $sum: 1 },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 15 },
    ]);
  }

  private async getCartAddsOverTime(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'add_to_cart', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          adds: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  private async getGeographicStats(since: Date) {
    return this.eventModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$properties.region',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  private async getSourceStats(since: Date) {
    return this.eventModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$properties.referrer',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  private async getChatbotVelocity(since: Date) {
    return this.eventModel.aggregate([
      { $match: { type: 'chatbot_interaction', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          interactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }
}
