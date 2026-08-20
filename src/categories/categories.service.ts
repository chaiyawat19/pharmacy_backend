import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Not, DataSource } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) { }

  async create(createCategoryDto: CreateCategoryDto) {
    const trimmedName = createCategoryDto.category_name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('กรุณากรอกชื่อประเภทข้อสอบ');
    }

    const existing = await this.categoryRepository.findOne({
      where: { category_name: ILike(trimmedName) }
    });

    if (existing) {
      throw new ConflictException(`ชื่อประเภทข้อสอบ "${trimmedName}" มีอยู่ในระบบแล้ว`);
    }

    const category = this.categoryRepository.create({
      ...createCategoryDto,
      category_name: trimmedName,
    });
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
        .filter(l => l.category_id === cat.category_id && l.item_bank)
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

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    if (!category) {
      throw new NotFoundException('ไม่พบประเภทข้อสอบที่ต้องการแก้ไข');
    }

    if (updateCategoryDto.category_name !== undefined) {
      const trimmedName = updateCategoryDto.category_name.trim();
      if (!trimmedName) {
        throw new BadRequestException('กรุณากรอกชื่อประเภทข้อสอบ');
      }

      const existing = await this.categoryRepository.findOne({
        where: {
          category_name: ILike(trimmedName),
          category_id: Not(id),
        },
      });

      if (existing) {
        throw new ConflictException(`ชื่อประเภทข้อสอบ "${trimmedName}" มีอยู่ในระบบแล้ว`);
      }

      updateCategoryDto.category_name = trimmedName;
    }

    await this.categoryRepository.update(id, updateCategoryDto);
    return this.findOne(id);
  }

  /**
   * ลบประเภทข้อสอบพร้อมปลดการผูกกับคลังข้อสอบอัตโนมัติ (Cascade Unlink)
   */
  async remove(id: number) {
    const category = await this.categoryRepository.findOne({
      where: { category_id: id }
    });

    if (!category) {
      throw new NotFoundException('ไม่พบประเภทข้อสอบที่ต้องการลบ');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. ปลดความสัมพันธ์ใน item_bank_category ทั้งหมด
      await queryRunner.manager.delete(ItemBankCategory, { category_id: id });

      // 2. ลบ Category
      await queryRunner.manager.delete(Category, { category_id: id });

      await queryRunner.commitTransaction();
      return {
        message: 'ลบประเภทข้อสอบและปลดการผูกคลังข้อสอบเรียบร้อยแล้ว',
        category_id: id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
