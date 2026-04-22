import { Controller, Get, Post, Body, Param, Query, Delete, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // Allow public access to submit feedback
  @Post()
  async create(@Body() createFeedbackDto: CreateFeedbackDto | CreateFeedbackDto[]) {
    return this.feedbackService.create(createFeedbackDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Query('page') page: string = '1', @Query('limit') limit: string = '20') {
    return this.feedbackService.findAll(+page, +limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.feedbackService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.feedbackService.delete(id);
  }
}
