import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { ItemBankCategory } from '../items-bank/entities/item_bank_category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(ItemBankCategory)
    private readonly itemBankCategoryRepo: Repository<ItemBankCategory>,
  ) { }

  create(createCategoryDto: CreateCategoryDto) {
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  findAll() {
    return this.categoryRepository.find({
      order: { category_id: 'ASC' }
    });
  }

  /**
   * Returns each category with the list of item banks linked to it.
   */
  async findAllWithBanks() {
    const categories = await this.categoryRepository.find({
      order: { category_id: 'ASC' }
    });

    const links = await this.itemBankCategoryRepo.find({
      relations: ['item_bank'],
    });

    return categories.map(cat => ({
      ...cat,
      item_banks: links
        .filter(l => l.category_id === cat.category_id)
        .map(l => ({
          item_bank_id: l.item_bank.item_bank_id,
          bank_name: l.item_bank.bank_name,
          description: l.item_bank.description,
          is_active: l.item_bank.is_active,
        })),
    }));
  }

  findOne(id: number) {
    return this.categoryRepository.findOne({
      where: { category_id: id }
    });
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return this.categoryRepository.update(id, updateCategoryDto);
  }

  remove(id: number) {
    return this.categoryRepository.delete(id);
  }
}
