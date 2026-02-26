import { Test, TestingModule } from '@nestjs/testing';
import { ItemsBankController } from './items-bank.controller';
import { ItemsBankService } from './items-bank.service';

describe('ItemsBankController', () => {
  let controller: ItemsBankController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsBankController],
      providers: [ItemsBankService],
    }).compile();

    controller = module.get<ItemsBankController>(ItemsBankController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
