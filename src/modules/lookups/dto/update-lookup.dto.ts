import { PartialType } from '@nestjs/mapped-types';
import { CreateLookupDto } from './create-lookup.dto.js';

export class UpdateLookupDto extends PartialType(CreateLookupDto) {}
