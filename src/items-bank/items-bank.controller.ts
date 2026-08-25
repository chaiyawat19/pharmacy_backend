import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ItemsBankService } from './items-bank.service';
import { ItemsBankImportService } from './items-bank-import.service';
import { IrtManagementService } from './irt-management.service';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { CreateSituationDto } from './dto/create-situation.dto';
import { CreateItemsDto } from './dto/create-items.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { CreateAnswerOptionDto } from './dto/answer_options.dto';
import { CreateBulkQuestionsDto } from './dto/create-bulk-questions.dto';

@Roles(2)
@Controller('items-bank')
export class ItemsBankController {
  constructor(
    private readonly itemsBankService: ItemsBankService,
    private readonly itemsBankImportService: ItemsBankImportService,
    private readonly irtManagementService: IrtManagementService,
  ) { }

  @Post()
  create(@Body() createItemsBankDto: CreateItemsBankDto) {
    return this.itemsBankService.createBank(createItemsBankDto);
  }

  @Post('with-excel')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
        ];
        const isExcel =
          allowedMimeTypes.includes(file.mimetype) ||
          file.originalname.match(/\.(xlsx|xls)$/i);
        if (!isExcel) {
          return cb(
            new BadRequestException('รองรับเฉพาะไฟล์ Excel (.xlsx, .xls) เท่านั้น'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 50 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  createWithExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    return this.itemsBankService.createBankWithExcel(body, file);
  }

  /**
   * รายการชุดข้อสอบ — เปิดให้ guest เข้าดูได้ (เฉพาะ metadata ไม่มีเฉลย)
   */
  @Public()
  @Get()
  getBank() {
    return this.itemsBankService.getBank();
  }

  @Get('deleted')
  getDeletedBanks() {
    return this.itemsBankService.getDeletedBanks();
  }

  @Public()
  @Get('search')
  search(@Query('q') query: string) {
    return this.itemsBankService.searchBanks(query);
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

  @Patch('reorder-situations')
  reorderSituations(@Body() reorderSituationsDto: any) {
    return this.itemsBankService.reorderSituations(reorderSituationsDto);
  }

  @Post('answer-option')
  createAnswerOption(@Body() createAnswerOptionDto: CreateAnswerOptionDto) {
    return this.itemsBankService.createAnswerOption(createAnswerOptionDto);
  }

  @Post('bulk-questions')
  createBulkQuestions(@Body() createBulkQuestionsDto: CreateBulkQuestionsDto) {
    return this.itemsBankService.createBulkQuestions(createBulkQuestionsDto);
  }

  @Post('situation/:situation_id/questions')
  addQuestionsToSituation(@Param('situation_id') situation_id: string, @Body() addQuestionsDto: any) {
    return this.itemsBankService.addQuestionsToSituation({
      situation_id: +situation_id,
      ...addQuestionsDto
    });
  }

  @Patch('situation/:id')
  updateSituation(@Param('id') id: string, @Body() updateData: Partial<CreateSituationDto>) {
    return this.itemsBankService.updateSituation(+id, updateData);
  }

  @Delete('situation/:id')
  deleteSituation(@Param('id') id: string) {
    return this.itemsBankService.deleteSituation(+id);
  }

  @Patch('item/:id')
  updateItem(@Param('id') id: string, @Body() updateData: any) {
    return this.itemsBankService.updateItem(+id, updateData);
  }

  @Delete('item/:id')
  deleteItem(@Param('id') id: string) {
    return this.itemsBankService.deleteItem(+id);
  }



  @Get(':id/items')
  getItemBankItems(@Param('id') id: string) {
    return this.itemsBankService.getItemBankItems(+id);
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

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.itemsBankService.restoreBank(+id);
  }

  @Delete(':id/permanent')
  hardDelete(@Param('id') id: string) {
    return this.itemsBankService.hardDeleteBank(+id);
  }

  @Post(':id/upload-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new BadRequestException('รองรับเฉพาะไฟล์ PDF เท่านั้น'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 30 * 1024 * 1024, // 30MB max สำหรับ PDF ข้อสอบ
        files: 1,
      },
    }),
  )
  uploadPdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.itemsBankService.addQuestionsFromPdf(+id, file);
  }

  @Post(':id/import-excel')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
        ];
        const isExcel = allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i);
        if (!isExcel) {
          return cb(
            new BadRequestException('รองรับเฉพาะไฟล์ Excel (.xlsx, .xls) เท่านั้น'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max สำหรับ Excel รวมรูปฝัง
        files: 1,
      },
    }),
  )
  importExcel(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('mode') mode?: 'append' | 'overwrite',
  ) {
    return this.itemsBankImportService.importExcelToBank(+id, file, mode || 'append');
  }


  // ==================== CAT Management Endpoints ====================

  /**
   * ดึงข้อสอบทั้งหมดที่มี IRT parameters ครบ พร้อมข้อมูล item bank
   */
  @Get('cat/items-with-irt')
  getItemsWithIRT() {
    return this.irtManagementService.getItemsWithIRTParameters();
  }

  /**
   * ดึงข้อสอบทั้งหมด (ทั้งที่มี IRT และยังไม่มี) สำหรับหน้า CAT Management
   */
  @Get('cat/all-items')
  getAllItemsForCAT() {
    return this.irtManagementService.getAllItemsForCATManagement();
  }

  /**
   * ดึงข้อสอบที่มี IRT parameters ในชุดข้อสอบเฉพาะ
   */
  @Get(':id/cat/items-with-irt')
  getItemBankItemsWithIRT(@Param('id') id: string) {
    return this.irtManagementService.getItemBankItemsWithIRT(+id);
  }

  /**
   * อัพเดท IRT parameters แบบ batch (หลายข้อพร้อมกัน)
   */
  @Patch('cat/batch-update-irt')
  batchUpdateIRTParameters(@Body() updateData: any) {
    return this.irtManagementService.batchUpdateIRTParameters(updateData);
  }

  /**
   * ดู CAT readiness summary ของทุก item banks
   */
  @Get('cat/readiness-summary')
  getCATReadinessSummary() {
    return this.irtManagementService.getCATReadinessSummary();
  }

  /**
   * ส่งออก Response Matrix (0/1 Matrix CSV) จากการทำข้อสอบปกติ
   */
  @Get('cat/export-response-matrix')
  exportResponseMatrix(@Query('item_bank_id') itemBankId?: string) {
    const bankId = itemBankId && !isNaN(+itemBankId) && +itemBankId > 0 ? +itemBankId : undefined;
    return this.irtManagementService.exportResponseMatrix(bankId);
  }

  /**
   * คำนวณสถิติ CTT และค่าประมาณการ IRT (a, b, c) จากประวัติการสอบจริง
   */
  @Get('cat/auto-calibration-stats')
  getAutoCalibrationStats(@Query('item_bank_id') itemBankId?: string) {
    const bankId = itemBankId && !isNaN(+itemBankId) && +itemBankId > 0 ? +itemBankId : undefined;
    return this.irtManagementService.getAutoCalibrationStats(bankId);
  }

  /**
   * นำเข้าและอัปเดต IRT parameters จากไฟล์ Calibrated CSV/JSON
   */
  @Post('cat/import-calibrated-irt')
  importCalibratedIRT(@Body() body: any) {
    const updates = Array.isArray(body) ? body : body.updates || [];
    return this.irtManagementService.importCalibratedIRT(updates);
  }

  /**
   * ดึงข้อมูล Dashboard ของ Item Bank
   */
  @Get(':id/dashboard')
  getDashboardStats(@Param('id') id: string) {
    return this.irtManagementService.getDashboardStats(+id);
  }
}

