import { Injectable } from '@nestjs/common';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';
import { ItemsBank } from './entities/items-bank.entity';

@Injectable()
export class ItemsBankService {
  constructor() {}

  createBank(createItemsBankDto: CreateItemsBankDto) {
    const bank = new ItemsBank();
    bank.bank_name = createItemsBankDto.bank_name;
    bank.bank_code = createItemsBankDto.bank_code;
    bank.description = createItemsBankDto.description;
    return {
      message: 'successfull',
      data: bank
    };
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
