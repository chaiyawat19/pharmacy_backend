import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ItemsBankService } from './items-bank.service';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { CreateSituationDto } from './dto/create-situation.dto';
import { CreateItemsDto } from './dto/create-items.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';
import { Roles } from 'src/common/decorators/role.decorator';
import { CreateAnswerOptionDto } from './dto/answer_options.dto';

@Roles(2)
@Controller('items-bank')
export class ItemsBankController {
  constructor(private readonly itemsBankService: ItemsBankService) { }

  @Post()
  create(@Body() createItemsBankDto: CreateItemsBankDto) {
    return this.itemsBankService.createBank(createItemsBankDto);
  }

  @Get()
  getBank() {
    return this.itemsBankService.getBank();
  }

  @Post('situation')
  createSituation(@Body() createSituationDto: CreateSituationDto) {
    return this.itemsBankService.createSituation(createSituationDto);
  }

  @Get('situation')
  getSituation() {
    return this.itemsBankService.getSituation();
  }

  @Post('item')
  createItem(@Body() createItemDto: CreateItemsDto) {
    return this.itemsBankService.createItems(createItemDto);
  }

  @Get('item')
  getItems() {
    return this.itemsBankService.getItems();
  }

  @Patch('reorder')
  reorderItems(@Body() reorderItemsDto: ReorderItemsDto) {
    return this.itemsBankService.reorderItems(reorderItemsDto);
  }

  @Post('answer-option')
  createAnswerOption(@Body() createAnswerOptionDto: CreateAnswerOptionDto) {
    return this.itemsBankService.createAnswerOption(createAnswerOptionDto);
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
