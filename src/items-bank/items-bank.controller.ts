import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';

@Controller('items-bank')
export class ItemsBankController {
  constructor(private readonly itemsBankService: ItemsBankService) {}

  @Post()
  create(@Body() createItemsBankDto: CreateItemsBankDto) {
    return this.itemsBankService.createBank(createItemsBankDto);
  }

  @Get()
  findAll() {
    return this.itemsBankService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemsBankService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateItemsBankDto: UpdateItemsBankDto) {
    return this.itemsBankService.update(+id, updateItemsBankDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.itemsBankService.remove(+id);
  }
}
