import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { ItemBankCategory } from '../items-bank/entities/item_bank_category.entity';
import { DataSource } from 'typeorm';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepo: any;
  let itemBankCategoryRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    categoryRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((cat) => Promise.resolve({ category_id: 1, ...cat })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    itemBankCategoryRepo = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(ItemBankCategory), useValue: itemBankCategoryRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find all categories', async () => {
    const mockCategories = [{ category_id: 1, category_name: 'Pharmacy Law' }];
    categoryRepo.find.mockResolvedValue(mockCategories);

    const result = await service.findAll();
    expect(result).toEqual(mockCategories);
    expect(categoryRepo.find).toHaveBeenCalled();
  });
});
