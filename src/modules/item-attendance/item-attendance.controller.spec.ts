import { Test, TestingModule } from '@nestjs/testing';
import { ItemAttendanceController } from './item-attendance.controller';

describe('ItemAttendanceController', () => {
  let controller: ItemAttendanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemAttendanceController],
    }).compile();

    controller = module.get<ItemAttendanceController>(ItemAttendanceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
