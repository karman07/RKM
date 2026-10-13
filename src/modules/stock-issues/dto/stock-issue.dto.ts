import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockIssuePurpose } from '../schemas/stock-issue.schema';

export class CreateStockIssueDto {
  /** Sales-team member receiving the material */
  @IsMongoId()
  @IsNotEmpty()
  sales_user_id: string;

  /** Branch the stock leaves from. Managers are pinned to their own branch; required for admins. */
  @IsMongoId()
  @IsOptional()
  branch_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  inventory_item_ids: string[];

  @IsEnum(StockIssuePurpose)
  @IsOptional()
  purpose?: StockIssuePurpose;

  @IsString()
  @IsOptional()
  destination?: string;

  @IsDateString()
  @IsOptional()
  expected_return_date?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CheckInLineDto {
  @IsMongoId()
  inventory_item_id: string;

  /** returned → back in branch stock; sold → released to stock so the sale is billed via the normal invoice flow */
  @IsIn(['returned', 'sold'])
  outcome: 'returned' | 'sold';

  @IsString()
  @IsOptional()
  note?: string;
}

export class CheckInStockIssueDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckInLineDto)
  items: CheckInLineDto[];
}
