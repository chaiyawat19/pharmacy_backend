import { Test, TestingModule } from '@nestjs/testing';
import { ItemsBankService } from './items-bank.service';

describe('ItemsBankService', () => {
  let service: ItemsBankService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ItemsBankService],
    }).compile();

    service = module.get<ItemsBankService>(ItemsBankService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
