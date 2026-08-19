import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { ItemBankCategory } from '../items-bank/entities/item_bank_category.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepo: any;
  let itemBankCategoryRepo: any;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(ItemBankCategory), useValue: itemBankCategoryRepo },
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
