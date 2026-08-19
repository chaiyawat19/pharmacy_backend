import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, ILike } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';
import { SubTopic } from '../topics/entities/sub-topics.entity';

interface ExtractedImageInfo {
  row: number; // 1-indexed row in worksheet
  col: number; // 1-indexed column in worksheet
  url: string;
}

@Injectable()
export class ItemsBankImportService {
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
    @InjectRepository(ItemSubTopic)
    private readonly itemSubTopicRepo: Repository<ItemSubTopic>,
    @InjectRepository(Topic)
    private readonly topicRepo: Repository<Topic>,
    @InjectRepository(SubTopic)
    private readonly subTopicRepo: Repository<SubTopic>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Import questions from Excel buffer into a specific Item Bank
   */
  async importExcelToBank(item_bank_id: number, file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }

    const bank = await this.bankRepo.findOne({ where: { item_bank_id } });
    if (!bank) {
      throw new NotFoundException(`ไม่พบชุดข้อสอบ ID ${item_bank_id}`);
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(Buffer.from(file.buffer) as any);
    } catch (err) {
      throw new BadRequestException('ไม่สามารถอ่านไฟล์ Excel ได้ กรุณาใช้ไฟล์ .xlsx หรือ .xls ที่ถูกต้อง');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException('ไฟล์ Excel ไม่มีข้อมูลหรือไม่มีหัวตาราง');
    }

    // 1. Parse Embedded Images
    const embeddedImages = this.extractEmbeddedImages(workbook, worksheet);

    // 2. Identify Headers (Check Row 1 first, if question col not found try Row 2)
    let headerRowIndex = 1;
    let colMap: { [key: string]: number } = {};

    const findHeadersInRow = (rowNum: number) => {
      const map: { [key: string]: number } = {};
      const row = worksheet.getRow(rowNum);
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerText = this.getCellValueAsString(cell).trim();
        const normalized = this.normalizeHeader(headerText);
        if (normalized) {
          map[normalized] = colNumber;
        }
      });
      return map;
    };

    colMap = findHeadersInRow(1);
    if (!colMap['question']) {
      colMap = findHeadersInRow(2);
      if (colMap['question']) {
        headerRowIndex = 2;
      }
    }

    // Validate essential columns
    if (!colMap['question']) {
      throw new BadRequestException('ไม่พบคอลัมน์ "คำถาม" (Question) ในไฟล์ Excel');
    }

    const startDataRow = headerRowIndex + 1;

    // 3. Process Rows
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let createdSituationsCount = 0;
      let createdQuestionsCount = 0;
      let createdTopicsCount = 0;
      let createdSubTopicsCount = 0;

      // Existing Counts for display_order
      let existingSituationsCount = await queryRunner.manager.count(ItemSituation, {
        where: { item_bank_id }
      });
      let existingItemsCount = await queryRunner.manager.count(ItemBankItem, {
        where: { item_bank_id }
      });

      let currentSituation: ItemSituation | null = null;
      let currentSituationText: string = '';

      const totalRows = worksheet.rowCount;

      for (let r = startDataRow; r <= totalRows; r++) {
        const row = worksheet.getRow(r);
        let questionText = this.getCellValueAsString(row.getCell(colMap['question'])).trim();

        // 1. Question Image Extraction (Strictly scoped)
        let questionImageUrl = colMap['question_image']
          ? this.getCellValueAsString(row.getCell(colMap['question_image'])).trim()
          : '';

        if (colMap['question_image']) {
          const cell = row.getCell(colMap['question_image']);
          if (cell.value && typeof cell.value === 'object' && 'hyperlink' in cell.value) {
            questionImageUrl = String((cell.value as any).hyperlink || questionImageUrl).trim();
          }
        }

        // Clean up dashes / placeholders
        if (questionImageUrl === '-' || questionImageUrl === 'ไม่มี' || questionImageUrl === 'none' || questionImageUrl === 'null' || questionImageUrl === 'undefined') {
          questionImageUrl = '';
        }

        // Extract HTTP URL if questionImageUrl contains HTML or text
        if (questionImageUrl) {
          const urlMatch = questionImageUrl.match(/https?:\/\/[^\s<>"'\(\)]+/i);
          if (urlMatch) {
            questionImageUrl = urlMatch[0];
          } else if (!questionImageUrl.startsWith('/uploads/') && !questionImageUrl.startsWith('data:image')) {
            // Not a valid URL or path
            questionImageUrl = '';
          }
        }

        // Embedded image for question_image column
        if (!questionImageUrl && colMap['question_image']) {
          const emb = embeddedImages.find(img => img.row === r && img.col === colMap['question_image']);
          if (emb) questionImageUrl = emb.url;
        }

        // If no specific question_image column exists, check embedded image for this row (excluding situation col)
        if (!questionImageUrl && !colMap['question_image']) {
          const emb = embeddedImages.find(img => img.row === r && img.col !== colMap['situation_image']);
          if (emb) questionImageUrl = emb.url;
        }

        // Skip row if both question text and question image are completely empty
        if (!questionText && !questionImageUrl) {
          continue;
        }

        if (!questionText && questionImageUrl) {
          questionText = '-';
        }

        // 2. Situation Text & Image Extraction (Strictly scoped)
        const rawSituationText = colMap['situation']
          ? this.getCellValueAsString(row.getCell(colMap['situation'])).trim()
          : '';

        let situationImageUrl = colMap['situation_image']
          ? this.getCellValueAsString(row.getCell(colMap['situation_image'])).trim()
          : '';

        if (colMap['situation_image']) {
          const cell = row.getCell(colMap['situation_image']);
          if (cell.value && typeof cell.value === 'object' && 'hyperlink' in cell.value) {
            situationImageUrl = String((cell.value as any).hyperlink || situationImageUrl).trim();
          }
        }

        if (situationImageUrl === '-' || situationImageUrl === 'ไม่มี' || situationImageUrl === 'none' || situationImageUrl === 'null' || situationImageUrl === 'undefined') {
          situationImageUrl = '';
        }

        if (situationImageUrl) {
          const urlMatch = situationImageUrl.match(/https?:\/\/[^\s<>"'\(\)]+/i);
          if (urlMatch) {
            situationImageUrl = urlMatch[0];
          } else if (!situationImageUrl.startsWith('/uploads/') && !situationImageUrl.startsWith('data:image')) {
            situationImageUrl = '';
          }
        }

        // Embedded image for situation
        if (!situationImageUrl && colMap['situation_image']) {
          const emb = embeddedImages.find(img => img.row === r && img.col === colMap['situation_image']);
          if (emb) situationImageUrl = emb.url;
        }

        // Get topic & subtopic
        const mainTopicName = colMap['main_topic']
          ? this.getCellValueAsString(row.getCell(colMap['main_topic'])).trim()
          : '';

        const subTopicName = colMap['sub_topic']
          ? this.getCellValueAsString(row.getCell(colMap['sub_topic'])).trim()
          : '';

        // Resolve or create Topic & SubTopic
        let subTopicId: number | null = null;
        if (subTopicName) {
          const result = await this.getOrCreateSubTopic(mainTopicName, subTopicName, queryRunner);
          subTopicId = result.subTopicId;
          if (result.isNewTopic) createdTopicsCount++;
          if (result.isNewSubTopic) createdSubTopicsCount++;
        }

        // Handle Situation grouping or creation
        const cleanSituationText = (rawSituationText === '-' || rawSituationText === 'ไม่มี') ? '' : rawSituationText;

        if (cleanSituationText || situationImageUrl) {
          if (!currentSituation || currentSituationText !== cleanSituationText) {
            existingSituationsCount++;
            currentSituationText = cleanSituationText;
            const newSituation = queryRunner.manager.create(ItemSituation, {
              item_bank_id,
              situation_text: cleanSituationText,
              situation_image_url: situationImageUrl || '',
              display_order: existingSituationsCount,
            });
            currentSituation = await queryRunner.manager.save(newSituation);
            createdSituationsCount++;
          }
        } else {
          currentSituation = null;
          currentSituationText = '';
        }

        // Options
        const options: { text: string; isCorrect: boolean }[] = [];
        for (let o = 1; o <= 5; o++) {
          const colIdx = colMap[`option_${o}`];
          if (colIdx) {
            const optText = this.getCellValueAsString(row.getCell(colIdx)).trim();
            if (optText) {
              options.push({ text: optText, isCorrect: false });
            }
          }
        }

        // Explanation
        const explanation = colMap['explanation']
          ? this.getCellValueAsString(row.getCell(colMap['explanation'])).trim()
          : '';

        // Answer Key
        const rawAnswerKey = colMap['answer_key']
          ? this.getCellValueAsString(row.getCell(colMap['answer_key']))
          : '';

        const correctIndex = this.parseAnswerKey(rawAnswerKey, options.length, options);
        if (options[correctIndex]) {
          options[correctIndex].isCorrect = true;
        }

        // Create Item
        const item = queryRunner.manager.create(Item, {
          question_text: questionText,
          explanation: explanation || '',
          situation_id: currentSituation ? currentSituation.situation_id : null,
          status: 'active',
          question_image_url: questionImageUrl || '',
          irt_a_discrimination: 1.0,
          irt_b_difficulty: 0.0,
          irt_c_guessing: 0.20,
        });
        const savedItem = await queryRunner.manager.save(item);

        // Create ItemBankItem
        existingItemsCount++;
        const itemBankItem = queryRunner.manager.create(ItemBankItem, {
          item_bank_id,
          item_id: savedItem.item_id,
          display_order: existingItemsCount,
        });
        await queryRunner.manager.save(itemBankItem);

        // Create AnswerOptions
        for (const opt of options) {
          const answerOption = queryRunner.manager.create(AnswerOption, {
            item_id: savedItem.item_id,
            option_text: opt.text,
            is_correct: opt.isCorrect,
          });
          await queryRunner.manager.save(answerOption);
        }

        // Create ItemSubTopic link
        if (subTopicId) {
          const itemSubTopic = queryRunner.manager.create(ItemSubTopic, {
            item_id: savedItem.item_id,
            sub_topic_id: subTopicId,
          });
          await queryRunner.manager.save(itemSubTopic);
        }

        createdQuestionsCount++;
      }

      await queryRunner.commitTransaction();

      return {
        message: 'นำเข้าข้อสอบจาก Excel สำเร็จ',
        items_count: createdQuestionsCount,
        situations_count: createdSituationsCount,
        created_topics_count: createdTopicsCount,
        created_sub_topics_count: createdSubTopicsCount,
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error importing Excel:', error);
      throw new InternalServerErrorException('เกิดข้อผิดพลาดในการนำเข้า Excel: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Helper to normalize header text to standard keys
   */
  private normalizeHeader(header: string): string | null {
    if (!header) return null;
    const rawLower = header.toLowerCase().trim();
    // Clean string removing spaces, punctuation, symbols, brackets
    const clean = rawLower.replace(/[\s.()\[\]\-_:;,\/\\]+/g, '');

    if (clean.includes('ข้อที่') || clean === 'no' || clean === 'n') return 'no';

    if (
      clean.includes('รูปภาพสถานการณ์') || clean.includes('รูปสถานการณ์') ||
      clean.includes('ภาพสถานการณ์') || clean.includes('situationimage') ||
      clean.includes('situationimg')
    ) {
      return 'situation_image';
    }

    if (clean.includes('สถานการณ์') || clean.includes('scenario') || clean.includes('context')) {
      return 'situation';
    }

    if (clean.includes('หัวข้อหลัก') || clean.includes('maintopic') || clean === 'topic') return 'main_topic';
    if (clean.includes('หัวข้อย่อย') || clean.includes('subtopic')) return 'sub_topic';

    if (
      clean.includes('รูปภาพคำถาม') || clean.includes('รูปคำถาม') || clean.includes('ภาพคำถาม') ||
      clean.includes('questionimage') || clean.includes('รูปภาพประกอบ') || clean.includes('รูปประกอบ') ||
      clean.includes('questionimg') || clean.includes('img') || clean.includes('picture')
    ) {
      return 'question_image';
    }

    if (clean.includes('คำถาม') || clean.includes('โจทย์') || clean.includes('question')) return 'question';

    if (clean.includes('ตัวเลือก1') || clean.includes('option1') || clean.includes('choice1') || clean === '1') return 'option_1';
    if (clean.includes('ตัวเลือก2') || clean.includes('option2') || clean.includes('choice2') || clean === '2') return 'option_2';
    if (clean.includes('ตัวเลือก3') || clean.includes('option3') || clean.includes('choice3') || clean === '3') return 'option_3';
    if (clean.includes('ตัวเลือก4') || clean.includes('option4') || clean.includes('choice4') || clean === '4') return 'option_4';
    if (clean.includes('ตัวเลือก5') || clean.includes('option5') || clean.includes('choice5') || clean === '5') return 'option_5';

    // 1. Explanation MUST be checked BEFORE answer_key because "คำอธิบายเฉลย (Answer Text)" contains both "คำอธิบาย" and "เฉลย"/"Answer"
    if (
      clean.includes('คำอธิบาย') || clean.includes('explanation') ||
      clean.includes('rationale') || clean.includes('answertext') ||
      clean.includes('answerdetail') || clean.includes('reason')
    ) {
      return 'explanation';
    }

    // 2. Answer key matching
    if (
      clean.includes('เฉลย') || clean.includes('answerkey') ||
      clean.includes('correctoption') || clean.includes('correctanswer') ||
      clean.includes('correct') || clean.includes('คำตอบ') ||
      clean.includes('ข้อถูก') || clean.includes('ข้อที่ถูก') || clean === 'ans'
    ) {
      return 'answer_key';
    }

    return null;
  }

  /**
   * Helper to convert any cell value to string, including hyperlinks
   */
  private getCellValueAsString(cell: ExcelJS.Cell): string {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
      if ('result' in cell.value && cell.value.result !== null && cell.value.result !== undefined) {
        return String(cell.value.result).trim();
      }
      if ('text' in cell.value && cell.value.text !== null && cell.value.text !== undefined) {
        return String(cell.value.text).trim();
      }
      if ('hyperlink' in cell.value) {
        return String((cell.value as any).hyperlink || (cell.value as any).text || '').trim();
      }
      if ('richText' in cell.value && Array.isArray((cell.value as any).richText)) {
        return (cell.value as any).richText.map((rt: any) => rt.text).join('').trim();
      }
    }
    return String(cell.value).trim();
  }

  /**
   * Extract embedded images from Excel workbook and worksheet and save to disk
   */
  private extractEmbeddedImages(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet): ExtractedImageInfo[] {
    const results: ExtractedImageInfo[] = [];

    try {
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const images = worksheet.getImages();
      for (const img of images) {
        const imageId = img.imageId;
        const media = workbook.getImage(Number(imageId));
        if (media && media.buffer) {
          const ext = media.extension || 'png';
          const filename = `excel_img_${Date.now()}_${uuidv4().substring(0, 8)}.${ext}`;
          const filePath = path.join(uploadDir, filename);

          fs.writeFileSync(filePath, Buffer.from(media.buffer as any));

          const row = Math.floor(img.range.tl.row) + 1; // 1-indexed
          const col = Math.floor(img.range.tl.col) + 1; // 1-indexed

          results.push({
            row,
            col,
            url: `/uploads/${filename}`,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to extract embedded images from Excel:', err);
    }

    return results;
  }

  /**
   * Parse answer key string to zero-based index
   */
  private parseAnswerKey(rawKey: any, optionsCount: number, options?: { text: string }[]): number {
    if (rawKey === null || rawKey === undefined) return 0;
    const rawStr = String(rawKey).trim();
    if (!rawStr) return 0;

    // 0. Option text exact match
    if (options && options.length > 0) {
      const matchedIdx = options.findIndex(opt => opt.text && opt.text.trim() === rawStr);
      if (matchedIdx !== -1) {
        return matchedIdx;
      }
    }

    // Remove prefixes like "ข้อที่", "ข้อ", "ans", "answer", "key", "option", "ตัวเลือก", "เฉลย" and dots/colons
    let clean = rawStr
      .replace(/^(ข้อที่|ข้อ|ans|answer|key|option|ตัวเลือก|เฉลย)\s*[:=]?\s*/i, '')
      .replace(/[.\s]+$/g, '')
      .replace(/^[.\s]+/g, '')
      .trim();

    // 1. Direct number check: 1 to optionsCount (handles "1", "2.0", "3", 5, etc.)
    const parsedNum = parseFloat(clean);
    if (!isNaN(parsedNum)) {
      const intVal = Math.floor(parsedNum);
      if (intVal >= 1 && intVal <= optionsCount) {
        return intVal - 1;
      }
    }

    // 2. Thai consonants: ก=0, ข=1, ค=2, ง=3, จ=4, ฉ=5
    const thaiMap: { [k: string]: number } = {
      'ก': 0, 'ข': 1, 'ค': 2, 'ง': 3, 'จ': 4, 'ฉ': 5
    };
    if (clean in thaiMap) {
      return thaiMap[clean];
    }

    // 3. English letters: A=0, B=1, C=2, D=3, E=4, F=5
    const upper = clean.toUpperCase();
    const engMap: { [k: string]: number } = {
      'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5
    };
    if (upper in engMap) {
      return engMap[upper];
    }

    // 4. Regex fallback: match numbers inside raw string
    const matchNum = rawStr.match(/[1-9]/);
    if (matchNum) {
      const val = parseInt(matchNum[0], 10);
      if (val >= 1 && val <= optionsCount) {
        return val - 1;
      }
    }

    // 5. Regex fallback: match Thai consonants inside raw string
    const matchThai = rawStr.match(/[ก-ฉ]/);
    if (matchThai && matchThai[0] in thaiMap) {
      return thaiMap[matchThai[0]];
    }

    // 6. Regex fallback: match English letters inside raw string
    const matchEng = rawStr.toUpperCase().match(/[A-F]/);
    if (matchEng && matchEng[0] in engMap) {
      return engMap[matchEng[0]];
    }

    return 0;
  }

  /**
   * Helper to find or create Topic and SubTopic
   */
  private async getOrCreateSubTopic(
    mainTopicName: string,
    subTopicName: string,
    queryRunner: any,
  ): Promise<{ subTopicId: number; isNewTopic: boolean; isNewSubTopic: boolean }> {
    const cleanMain = mainTopicName ? mainTopicName.trim() : 'หมวดหมู่ทั่วไป';
    const cleanSub = subTopicName.trim();

    let isNewTopic = false;
    let isNewSubTopic = false;

    // Find Topic
    let topic = await queryRunner.manager.findOne(Topic, {
      where: { topic_name: ILike(cleanMain) },
    });

    if (!topic) {
      topic = queryRunner.manager.create(Topic, {
        topic_name: cleanMain,
        description: 'สร้างให้อัตโนมัติจากการนำเข้า Excel',
      });
      topic = await queryRunner.manager.save(topic);
      isNewTopic = true;
    }

    // Find SubTopic
    let subTopic = await queryRunner.manager.findOne(SubTopic, {
      where: {
        topic_id: topic.topic_id,
        sub_topic_name: ILike(cleanSub),
      },
    });

    if (!subTopic) {
      subTopic = queryRunner.manager.create(SubTopic, {
        topic_id: topic.topic_id,
        sub_topic_name: cleanSub,
        description: 'สร้างให้อัตโนมัติจากการนำเข้า Excel',
      });
      subTopic = await queryRunner.manager.save(subTopic);
      isNewSubTopic = true;
    }

    return {
      subTopicId: subTopic.sub_topic_id,
      isNewTopic,
      isNewSubTopic,
    };
  }
}
