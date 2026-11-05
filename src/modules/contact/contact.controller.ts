import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Public: customers submit support / account-deletion requests from rkmjewellers.com/contact
  @Post()
  create(@Body() dto: CreateContactMessageDto) {
    return this.contactService.create(dto);
  }

  // Staff only
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.contactService.findAll(+page, +limit);
  }
}
