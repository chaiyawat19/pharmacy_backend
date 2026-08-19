import { Test, TestingModule } from '@nestjs/testing';
import { ItemsBankController } from './items-bank.controller';
import { ItemsBankService } from './items-bank.service';
import { ItemsBankImportService } from './items-bank-import.service';
import { IrtManagementService } from './irt-management.service';

describe('ItemsBankController', () => {
  let controller: ItemsBankController;
  let service: Partial<ItemsBankService>;
  let importService: Partial<ItemsBankImportService>;
  let irtManagementService: Partial<IrtManagementService>;

  beforeEach(async () => {
    service = {
      getBank: jest.fn().mockResolvedValue([]),
      createBank: jest.fn().mockResolvedValue({ item_bank_id: 1 } as any),
      searchBanks: jest.fn().mockResolvedValue([]),
      createSituation: jest.fn().mockResolvedValue({ situation_id: 1 } as any),
      getSituation: jest.fn().mockResolvedValue([]),
      createItems: jest.fn().mockResolvedValue({ item_id: 1 } as any),
      getItems: jest.fn().mockResolvedValue([]),
    };

    importService = {
      importExcelToBank: jest.fn().mockResolvedValue([] as any),
    };

    irtManagementService = {
      getItemsWithIRTParameters: jest.fn().mockResolvedValue([] as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemsBankController],
      providers: [
        { provide: ItemsBankService, useValue: service },
        { provide: ItemsBankImportService, useValue: importService },
        { provide: IrtManagementService, useValue: irtManagementService },
      ],
    }).compile();

    controller = module.get<ItemsBankController>(ItemsBankController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getBank', async () => {
    await controller.getBank();
    expect(service.getBank).toHaveBeenCalled();
  });
});
