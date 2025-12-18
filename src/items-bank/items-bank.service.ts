import { Injectable } from '@nestjs/common';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';
import { CreateItemsDto } from './dto/create-items.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';
import { CreateAnswerOptionDto } from './dto/answer_options.dto';

@Injectable()
export class ItemsBankService {
  constructor(
    @InjectRepository(ItemsBank)
    private readonly bankRepo: Repository<ItemsBank>,
    @InjectRepository(ItemSituation)
    private readonly situationRepo: Repository<ItemSituation>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemBankItem)
    private readonly itemBankItemRepo: Repository<ItemBankItem>,
    @InjectRepository(AnswerOption)
    private readonly answerOptionRepo: Repository<AnswerOption>,
  ) { }

  createBank(createItemsBankDto: CreateItemsBankDto) {
    const bank = this.bankRepo.create(createItemsBankDto);
    return this.bankRepo.save(bank);
  }

  getBank() {
    return this.bankRepo.find();
  }

  createSituation(createSituationDto: CreateSituationDto) {
    const situation = this.situationRepo.create(createSituationDto);
    return this.situationRepo.save(situation);
  }

  getSituation() {
    return this.situationRepo.find();
  }

  async createItems(createItemsDto: CreateItemsDto) {
    // 1. แยกข้อมูลสำหรับ save ลง table items
    const { item_bank_id, display_order, ...itemData } = createItemsDto;

    // 2. Save Item เพื่อให้ได้ item_id
    const item = this.itemRepo.create(itemData);
    const savedItem = await this.itemRepo.save(item);

    // 3. Save ลงตาราง item_bank_items
    const itemBankItem = this.itemBankItemRepo.create({
      item_bank_id: item_bank_id,
      item_id: savedItem.item_id,
      display_order: display_order,
    });

    await this.itemBankItemRepo.save(itemBankItem);

    return savedItem;
  }

  getItems() {
    return this.itemRepo.find();
  }


  async reorderItems(reorderItemsDto: ReorderItemsDto) {
    const { item_bank_id, sorted_item_ids } = reorderItemsDto;

    // เลือกใช้ Transaction หรือ Promise.all เพื่อความเร็ว
    const updates = sorted_item_ids.map((item_id, index) => {
      return this.itemBankItemRepo.update(
        { item_bank_id: item_bank_id, item_id: item_id },
        { display_order: index + 1 }
      );
    });

    await Promise.all(updates);

    return { message: 'Reorder successful' };
  }


  createAnswerOption(createAnswerOptionDto: CreateAnswerOptionDto) {
    const answerOption = this.answerOptionRepo.create(createAnswerOptionDto);
    return this.answerOptionRepo.save(answerOption);
  }

  findAll() {
    return `This action returns all itemsBank`;
  }

  findOne(id: number) {
    return `This action returns a #${id} itemsBank`;
  }

  update(id: number, updateItemsBankDto: UpdateItemsBankDto) {
    return `This action updates a #${id} itemsBank`;
  }

  remove(id: number) {
    return `This action removes a #${id} itemsBank`;
  }

  
}
