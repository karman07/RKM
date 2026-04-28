import { Test, TestingModule } from '@nestjs/testing';
import { ItemAttendanceService } from './item-attendance.service';

describe('ItemAttendanceService', () => {
  let service: ItemAttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemAttendanceService],
    }).compile();

    service = module.get<ItemAttendanceService>(ItemAttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
