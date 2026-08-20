import { Injectable, NotFoundException, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CreateItemsBankDto } from './dto/create-items-bank.dto';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateItemsBankDto } from './dto/update-items-bank.dto';
import { CreateItemsDto } from './dto/create-items.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';
import { ItemsBank } from './entities/items-bank.entity';
import { ItemSituation } from './entities/item_situations.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, ILike, Not, IsNull } from 'typeorm';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { AnswerOption } from './entities/answer_options.entity';
import { CreateAnswerOptionDto } from './dto/answer_options.dto';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { CreateBulkQuestionsDto } from './dto/create-bulk-questions.dto';
import { ItemBankCategory } from './entities/item_bank_category.entity';
import { ExamSession } from './entities/exam-session.entity';
import { StartExamDto, SubmitExamDto } from './dto/exam.dto';
import { UserItemMastery } from './entities/user_item_mastery.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NameUniquenessService } from '../common/name-uniqueness.service';

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
    @InjectRepository(ItemSubTopic)
    private readonly itemSubTopicRepo: Repository<ItemSubTopic>,
    @InjectRepository(ItemBankCategory)
    private readonly itemBankCategoryRepo: Repository<ItemBankCategory>,
    @InjectRepository(ExamSession)
    private readonly examSessionRepo: Repository<ExamSession>,
    @InjectRepository(UserItemMastery)
    private readonly userItemMasteryRepo: Repository<UserItemMastery>,
    @InjectRepository(CATSession)
    private readonly catSessionRepo: Repository<CATSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly nameUniquenessService: NameUniquenessService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.configService.get<string>('GEMINI_API_KEY') || '');
  }

  private genAI: GoogleGenerativeAI;

  async createBank(createItemsBankDto: CreateItemsBankDto) {
    // Check name uniqueness across all entities
    const uniquenessCheck = await this.nameUniquenessService.checkNameUniqueness(
      createItemsBankDto.bank_name,
      'itembank'
    );

    if (uniquenessCheck.exists) {
      throw new BadRequestException(
        `ชื่อ "${createItemsBankDto.bank_name}" ถูกใช้ไปแล้ว`
      );
    }

    if (createItemsBankDto.is_active) {
      throw new BadRequestException('ต้องมีอย่างน้อย 1 คำถาม/สถานการณ์ ถึงจะสามารถเปิดใช้งานชุดข้อสอบได้');
    }

    const { category_ids, ...bankData } = createItemsBankDto;

    // สร้าง item bank
    const bank = this.bankRepo.create(bankData);
    const savedBank = await this.bankRepo.save(bank);

    // ถ้ามี category_ids ให้บันทึกลง item_bank_category
    if (category_ids && category_ids.length > 0) {
      const categoryRelations = category_ids.map(category_id =>
        this.itemBankCategoryRepo.create({
          item_bank_id: savedBank.item_bank_id,
          category_id: category_id
        })
      );
      await this.itemBankCategoryRepo.save(categoryRelations);
    }

    // ── แจ้งเตือนผู้ใช้ทุกคน (role_id = 1) เกี่ยวกับชุดข้อสอบใหม่ (เฉพาะเมื่อเปิดใช้งาน) ──
    if (savedBank.is_active) {
      this.notifyAllUsersNewExamBank(savedBank).catch(err =>
        console.error('Failed to send exam bank notifications:', err)
      );
    }

    return savedBank;
  }

  /**
   * เพิ่มข้อสอบเข้าไปใน Item Bank ที่มีอยู่แล้ว โดยใช้ AI อ่านไฟล์ PDF
   */
  async addQuestionsFromPdf(item_bank_id: number, file: Express.Multer.File) {
    if (!file) throw new Error('ไม่พบไฟล์ที่อัปโหลด');
    const bank = await this.bankRepo.findOne({ where: { item_bank_id } });
    if (!bank) throw new NotFoundException(`ไม่พบชุดข้อสอบ ID ${item_bank_id}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. ส่งไฟล์ให้ AI สกัดข้อสอบ
      const extractedQuestions = await this.extractQuestionsFromPdf(file);

      // 2. สร้าง Situation ใหม่สำหรับไฟล์นี้ (เพื่อรองรับ constraint)
      const existingSituationsCount = await queryRunner.manager.count(ItemSituation, {
        where: { item_bank_id }
      });

      const fileName = file.originalname || 'ไฟล์ PDF';
      const situation = queryRunner.manager.create(ItemSituation, {
        item_bank_id,
        situation_text: `ข้อสอบที่ดึงมาจาก ${fileName} (${new Date().toLocaleDateString('th-TH')})`,
        situation_image_url: '',
        display_order: existingSituationsCount + 1,
      });
      const savedSituation = await queryRunner.manager.save(situation);

      // 3. ดึงจำนวนข้อที่มีอยู่แล้วเพื่อรัน display_order ต่อ
      const existingItemsCount = await queryRunner.manager.count(ItemBankItem, {
        where: { item_bank_id }
      });

      // 4. วนลูปบันทึกข้อสอบ
      for (let i = 0; i < extractedQuestions.length; i++) {
        const qData = extractedQuestions[i];

        // สร้าง Item
        const item = queryRunner.manager.create(Item, {
          question_text: qData.question_text,
          explanation: qData.explanation || '',
          situation_id: savedSituation.situation_id,
          status: 'ACTIVE',
          irt_a_discrimination: null,
          irt_b_difficulty: null,
          irt_c_guessing: null,
        });
        const savedItem = await queryRunner.manager.save(item);

        // เชื่อมกับ Item Bank
        const itemBankItem = queryRunner.manager.create(ItemBankItem, {
          item_bank_id: item_bank_id,
          item_id: savedItem.item_id,
          display_order: existingItemsCount + i + 1,
        });
        await queryRunner.manager.save(itemBankItem);

        // สร้างตัวเลือกคำตอบ
        if (qData.options && Array.isArray(qData.options)) {
          for (const opt of qData.options) {
            const answerOption = queryRunner.manager.create(AnswerOption, {
              item_id: savedItem.item_id,
              option_text: opt.text,
              is_correct: opt.is_correct,
            });
            await queryRunner.manager.save(answerOption);
          }
        }
      }

      await queryRunner.commitTransaction();

      return {
        message: 'เพิ่มข้อสอบจาก PDF สำเร็จ',
        items_count: extractedQuestions.length,
        situation_id: savedSituation.situation_id
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('PDF Processing Error:', error);
      throw new InternalServerErrorException('เกิดข้อผิดพลาดในการประมวลผล PDF: ' + error.message);
    } finally {
      await queryRunner.release();
    }
  }

  private async extractQuestionsFromPdf(file: Express.Multer.File) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `ช่วยสกัดข้อสอบจากไฟล์ PDF นี้ โดยมีเงื่อนไขดังนี้:
      1. แต่ละข้อมีโจทย์ (question_text) และตัวเลือก (options)
      2. ตัวเลือกที่มีการ "ไฮไลท์สีเหลือง" (Yellow Highlight) ในเอกสาร คือคำตอบที่ถูกต้อง (is_correct: true) 
      3. ดึงคำอธิบาย (explanation) มาด้วยถ้ามี (ถ้าไม่มีให้เป็นค่าว่าง)
      4. ตอบกลับเป็น JSON Array เท่านั้น ตามรูปแบบนี้:
      [
        {
          "question_text": "...",
          "options": [
            {"text": "...", "is_correct": true/false},
            ...
          ],
          "explanation": "..."
        }
      ]
      ตอบเฉพาะ JSON เท่านั้น ห้ามมีข้อความอื่นหรือ Markdown code block`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);

      const response = await result.response;
      let responseText = response.text();
      console.log('AI Raw Response:', responseText);

      if (!responseText) throw new Error('AI ไม่ตอบสนอง');

      // พยายามหา [ ... ] ในข้อความ เพราะ AI อาจจะตอบมาพร้อมคำอธิบาย
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText.replace(/```json|```/g, '').trim();

      try {
        return JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse AI response:', responseText);
        throw new Error('AI ตอบกลับด้วยรูปแบบที่ซับซ้อนเกินไป กรุณาลองใหม่');
      }
    } catch (error) {
      console.error('AI Extraction Error:', error);
      throw new Error('AI ล้มเหลวในการสกัดข้อมูล: ' + error.message);
    }
  }

  /** ส่ง notification ไปยัง user ทุกคน (role_id = 1) แบบ non-blocking */
  private async notifyAllUsersNewExamBank(bank: ItemsBank) {
    const title = `📚 ชุดข้อสอบใหม่: ${bank.bank_name}`;
    const message = bank.description
      ? `มีชุดข้อสอบใหม่ "${bank.bank_name}" เพิ่มเข้ามาแล้ว — ${bank.description}`
      : `มีชุดข้อสอบใหม่ "${bank.bank_name}" เพิ่มเข้ามาแล้ว`;
    const link_url = `/user/examset`;
    const notification_type_id = 3; // ประเภท: ชุดข้อสอบ

    // ดึง user ทุกคนที่เป็น role_id = 1 (ผู้ใช้ทั่วไป)
    const users = await this.userRepo.find({ where: { role_id: 1 } });

    // บันทึก notification ใน DB สำหรับแต่ละ user + push WebSocket
    const notificationPayloadBase = {
      title,
      message,
      link_url,
      notification_type_id,
      is_read: false,
      created_at: new Date(),
    };

    const notificationEntities = users.map(u =>
      this.notificationRepo.create({
        user_id: u.user_id,
        title,
        message,
        link_url,
        notification_type_id,
      })
    );

    const saved = await this.notificationRepo.save(notificationEntities);

    // Push notification ผ่าน WebSocket ให้ user ที่ออนไลน์อยู่
    for (const n of saved) {
      this.notificationsGateway.sendNotificationToUser(n.user_id, {
        ...notificationPayloadBase,
        notification_id: n.notification_id,
      });
    }
  }

  async getBank() {
    const banks = await this.bankRepo.find({
      order: { item_bank_id: 'ASC' }
    });

    return this.enrichBanksWithDetails(banks);
  }

  async getDeletedBanks() {
    const banks = await this.bankRepo.find({
      withDeleted: true,
      where: {
        deleted_at: Not(IsNull())
      },
      order: { deleted_at: 'DESC' }
    });

    return this.enrichBanksWithDetails(banks);
  }

  async searchBanks(query: string) {
    // ตัดช่องว่างออกจากคำค้นหา
    const cleanQuery = query.replace(/\s+/g, '');

    const banks = await this.bankRepo
      .createQueryBuilder('bank')
      // ตัดช่องว่างจาก bank_name และ description แล้วเปรียบเทียบแบบ ILike
      .where("REPLACE(bank.bank_name, ' ', '') ILIKE :query", { query: `%${cleanQuery}%` })
      .orWhere("REPLACE(bank.description, ' ', '') ILIKE :query", { query: `%${cleanQuery}%` })
      .orderBy('bank.item_bank_id', 'ASC')
      .getMany();

    return this.enrichBanksWithDetails(banks);
  }

  private async enrichBanksWithDetails(banks: ItemsBank[]) {
    // ดึง categories และนับจำนวนข้อสอบสำหรับแต่ละ bank
    const banksWithCategories = await Promise.all(
      banks.map(async (bank) => {
        const categoryRelations = await this.itemBankCategoryRepo.find({
          where: { item_bank_id: bank.item_bank_id },
          relations: ['category']
        });

        const categories = categoryRelations.map(rel => rel.category);

        // นับจำนวนข้อสอบจาก item_bank_items
        const totalItems = await this.itemBankItemRepo.count({
          where: { item_bank_id: bank.item_bank_id }
        });

        return {
          ...bank,
          categories: categories,
          total_items: totalItems
        };
      })
    );

    return banksWithCategories;
  }

  async createSituation(createSituationDto: CreateSituationDto) {
    // นับจำนวนสถานการณ์ที่มีอยู่แล้วใน item bank นี้
    const existingSituationsCount = await this.situationRepo.count({
      where: { item_bank_id: createSituationDto.item_bank_id }
    });

    const situation = this.situationRepo.create({
      ...createSituationDto,
      display_order: existingSituationsCount + 1
    });
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

    // 4. Save ลงตาราง item_sub_topics (ถ้ามี)
    if (createItemsDto.sub_topic_ids && Array.isArray(createItemsDto.sub_topic_ids) && createItemsDto.sub_topic_ids.length > 0) {
      const itemSubTopics = createItemsDto.sub_topic_ids.map(id =>
        this.itemSubTopicRepo.create({
          item_id: savedItem.item_id,
          sub_topic_id: Number(id),
        })
      );
      await this.itemSubTopicRepo.save(itemSubTopics);
    } else if (createItemsDto.sub_topic_id) {
      const itemSubTopic = this.itemSubTopicRepo.create({
        item_id: savedItem.item_id,
        sub_topic_id: createItemsDto.sub_topic_id,
      });
      await this.itemSubTopicRepo.save(itemSubTopic);
    }

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

    return { message: 'Reorder items successful' };
  }

  async reorderSituations(reorderSituationsDto: any) {
    const { item_bank_id, sorted_situation_ids } = reorderSituationsDto;

    const updates = sorted_situation_ids.map((situation_id, index) => {
      return this.situationRepo.update(
        { item_bank_id: item_bank_id, situation_id: situation_id },
        { display_order: index + 1 },
      );
    });

    await Promise.all(updates);

    return { message: 'Reorder situations successful' };
  }


  createAnswerOption(createAnswerOptionDto: CreateAnswerOptionDto) {
    const answerOption = this.answerOptionRepo.create(createAnswerOptionDto);
    return this.answerOptionRepo.save(answerOption);
  }

  /**
   * บันทึก situation พร้อมกับหลายคำถามและคำตอบในครั้งเดียว
   * ใช้ Transaction เพื่อให้แน่ใจว่าข้อมูลจะถูกบันทึกทั้งหมดหรือไม่บันทึกเลย
   */
  async createBulkQuestions(createBulkQuestionsDto: CreateBulkQuestionsDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { item_bank_id, situation_text, situation_image_url, questions } = createBulkQuestionsDto;

      // 1. สร้าง Situation (เฉพาะเมื่อมีข้อความหรือรูปภาพสถานการณ์)
      let savedSituation: ItemSituation | null = null;
      const cleanSitText = situation_text ? situation_text.replace(/<[^>]*>/g, '').trim() : '';
      const cleanSitImg = situation_image_url ? situation_image_url.trim() : '';

      if (cleanSitText || cleanSitImg) {
        const existingSituationsCount = await queryRunner.manager.count(ItemSituation, {
            where: { item_bank_id },
        });

        const situation = queryRunner.manager.create(ItemSituation, {
          item_bank_id,
          situation_text: situation_text || '',
          situation_image_url: situation_image_url || '',
          display_order: existingSituationsCount + 1,
        });
        savedSituation = await queryRunner.manager.save(situation);
      }

      const savedItems: Item[] = [];

      // นับจำนวนคำถามที่มีอยู่แล้วใน item bank เพื่อกำหนด display_order ที่ถูกต้อง
      const existingItemsCount = await queryRunner.manager.count(ItemBankItem, {
        where: { item_bank_id }
      });

      // 2. วนลูปสร้างแต่ละคำถาม
      for (let i = 0; i < questions.length; i++) {
        const questionData = questions[i];
        const { answer_options, sub_topic_id, sub_topic_ids, ...itemData } = questionData;

        // 2.1 สร้าง Item
        const item = queryRunner.manager.create(Item, {
          ...itemData,
          situation_id: savedSituation ? savedSituation.situation_id : null,
          irt_a_discrimination: itemData.irt_a_discrimination ?? null,
          irt_b_difficulty: itemData.irt_b_difficulty ?? null,
          irt_c_guessing: itemData.irt_c_guessing ?? null,
        });
        const savedItem = await queryRunner.manager.save(item);

        // 2.2 สร้างความสัมพันธ์ใน item_bank_items (ตรวจสอบว่ามีอยู่แล้วหรือไม่)
        const existingRelation = await queryRunner.manager.findOne(ItemBankItem, {
            where: { item_bank_id, item_id: savedItem.item_id },
        });

        if (!existingRelation) {
          const itemBankItem = queryRunner.manager.create(ItemBankItem, {
            item_bank_id,
            item_id: savedItem.item_id,
            display_order: existingItemsCount + i + 1, // เรียงต่อจากที่มีอยู่
          });
          await queryRunner.manager.save(itemBankItem);
        }

        // 2.3 ถ้ามี sub_topic_id ให้สร้างความสัมพันธ์ใน item_sub_topics
        if (sub_topic_ids && Array.isArray(sub_topic_ids) && sub_topic_ids.length > 0) {
          const itemSubTopics = sub_topic_ids.map(id =>
            queryRunner.manager.create(ItemSubTopic, {
              item_id: savedItem.item_id,
              sub_topic_id: Number(id),
            })
          );
          await queryRunner.manager.save(itemSubTopics);
        } else if (sub_topic_id) {
          const itemSubTopic = queryRunner.manager.create(ItemSubTopic, {
            item_id: savedItem.item_id,
            sub_topic_id,
          });
          await queryRunner.manager.save(itemSubTopic);
        }

        // สร้าง Answer Options สำหรับคำถามนี้
        for (let j = 0; j < answer_options.length; j++) {
          const answerData = answer_options[j];
          const answerOption = queryRunner.manager.create(AnswerOption, {
            item_id: savedItem.item_id,
            option_text: answerData.option_text,
            is_correct: answerData.is_correct,
            option_image_url: answerData.option_image_url || null,
          });
          await queryRunner.manager.save(answerOption);
        }

        savedItems.push(savedItem);
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      return {
        message: 'สร้างคำถามทั้งหมดสำเร็จ',
        situation: savedSituation,
        items: savedItems,
        total_questions: savedItems.length,
      };
    } catch (error) {
      // Rollback transaction ถ้ามีข้อผิดพลาด
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // ปล่อย queryRunner
      await queryRunner.release();
    }
  }

  /**
   * เพิ่มคำถามใหม่เข้าใน situation ที่มีอยู่แล้ว
   */
  async addQuestionsToSituation(addQuestionsDto: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { situation_id, item_bank_id, questions } = addQuestionsDto;

      // ตรวจสอบว่า situation มีอยู่จริง
      const situation = await this.situationRepo.findOne({ where: { situation_id } });
      if (!situation) {
        throw new NotFoundException(`ไม่พบสถานการณ์ ID ${situation_id}`);
      }

      const savedItems: Item[] = [];

      // นับจำนวนคำถามที่มีอยู่แล้วใน item bank เพื่อกำหนด display_order
      const existingItemsCount = await this.itemBankItemRepo.count({
        where: { item_bank_id }
      });

      // วนลูปสร้างแต่ละคำถาม
      for (let i = 0; i < questions.length; i++) {
        const questionData = questions[i];
        const { answer_options, sub_topic_id, sub_topic_ids, ...itemData } = questionData;

        // สร้าง Item
        const item = queryRunner.manager.create(Item, {
          ...itemData,
          situation_id: situation_id,
          irt_a_discrimination: itemData.irt_a_discrimination ?? null,
          irt_b_difficulty: itemData.irt_b_difficulty ?? null,
          irt_c_guessing: itemData.irt_c_guessing ?? null,
        });
        const savedItem = await queryRunner.manager.save(item);


        // สร้างความสัมพันธ์ใน item_bank_items (ตรวจสอบว่ามีอยู่แล้วหรือไม่)
        const existingRelation = await queryRunner.manager.findOne(ItemBankItem, {
          where: { item_bank_id, item_id: savedItem.item_id }
        });

        if (!existingRelation) {
          const itemBankItem = queryRunner.manager.create(ItemBankItem, {
            item_bank_id,
            item_id: savedItem.item_id,
            display_order: existingItemsCount + i + 1, // เพิ่มต่อจากที่มีอยู่
          });
          await queryRunner.manager.save(itemBankItem);
        }

        // ถ้ามี sub_topic_id หรือ sub_topic_ids ให้สร้างความสัมพันธ์ใน item_sub_topics
        if (sub_topic_ids && Array.isArray(sub_topic_ids) && sub_topic_ids.length > 0) {
          const itemSubTopics = sub_topic_ids.map(id =>
            queryRunner.manager.create(ItemSubTopic, {
              item_id: savedItem.item_id,
              sub_topic_id: Number(id),
            })
          );
          await queryRunner.manager.save(itemSubTopics);
        } else if (sub_topic_id) {
          const itemSubTopic = queryRunner.manager.create(ItemSubTopic, {
            item_id: savedItem.item_id,
            sub_topic_id,
          });
          await queryRunner.manager.save(itemSubTopic);
        }

        // สร้าง Answer Options สำหรับคำถามนี้
        for (let j = 0; j < answer_options.length; j++) {
          const answerData = answer_options[j];
          const answerOption = queryRunner.manager.create(AnswerOption, {
            item_id: savedItem.item_id,
            option_text: answerData.option_text,
            is_correct: answerData.is_correct,
            option_image_url: answerData.option_image_url || null,
          });
          await queryRunner.manager.save(answerOption);
        }

        savedItems.push(savedItem);
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      return {
        message: 'เพิ่มคำถามใหม่สำเร็จ',
        situation_id: situation_id,
        items: savedItems,
        total_questions: savedItems.length,
      };
    } catch (error) {
      // Rollback transaction ถ้ามีข้อผิดพลาด
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // ปล่อย queryRunner
      await queryRunner.release();
    }
  }

  findAll() {
    return `This action returns all itemsBank`;
  }

  /**
   * ดึงข้อมูลคำถามทั้งหมดในคลังข้อสอบ พร้อมข้อมูลที่เกี่ยวข้อง
   * @param item_bank_id - ID ของคลังข้อสอบ
   * @returns รายการคำถามทั้งหมดพร้อมข้อมูลที่เกี่ยวข้อง
   */
  async getItemBankItems(item_bank_id: number) {
    // ตรวจสอบว่าคลังข้อสอบมีอยู่จริง
    const bank = await this.bankRepo.findOne({
      where: { item_bank_id }
    });

    if (!bank) {
      throw new NotFoundException(
        `Item bank with ID ${item_bank_id} not found`,
      );
    }

    // ดึงข้อมูลคำถามทั้งหมดในคลังข้อสอบ
    const itemBankItems = await this.itemBankItemRepo.find({
      where: { item_bank_id },
      relations: ['item', 'item.situation'],
    });

    // เรียงลำดับคำถามตาม display_order ในชุดข้อสอบ
    itemBankItems.sort((a, b) => {
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

    // ดึงข้อมูลเพิ่มเติมสำหรับแต่ละคำถาม
    const itemsWithDetails = await Promise.all(
      itemBankItems.map(async (itemBankItem) => {
        const item = itemBankItem.item;

        // ดึง answer options
        const answerOptions = await this.answerOptionRepo.find({
          where: { item_id: item.item_id },
          order: { option_id: 'ASC' }
        });

        // ดึง sub topics
        const itemSubTopics = await this.itemSubTopicRepo.find({
          where: { item_id: item.item_id },
          relations: ['sub_topic', 'sub_topic.topic']
        });

        return {
          item_id: item.item_id,
          question_text: item.question_text,
          question_image_url: item.question_image_url,
          explanation: item.explanation,
          status: item.status,
          display_order: itemBankItem.display_order,
          irt_a_discrimination: item.irt_a_discrimination,
          irt_b_difficulty: item.irt_b_difficulty,
          irt_c_guessing: item.irt_c_guessing,
          created_at: item.created_at,
          updated_at: item.updated_at,
          situation: item.situation ? {
            situation_id: item.situation.situation_id,
            situation_text: item.situation.situation_text,
            situation_image_url: item.situation.situation_image_url,
            display_order: item.situation.display_order
          } : null,
          answer_options: answerOptions.map(option => ({
            option_id: option.option_id,
            option_text: option.option_text,
            is_correct: option.is_correct,
            option_image_url: option.option_image_url
          })),
          sub_topics: itemSubTopics.map(ist => ({
            sub_topic_id: ist.sub_topic.sub_topic_id,
            sub_topic_name: ist.sub_topic.sub_topic_name,
            topic: ist.sub_topic.topic ? {
              topic_id: ist.sub_topic.topic.topic_id,
              topic_name: ist.sub_topic.topic.topic_name
            } : null
          }))
        };
      })
    );

    return {
      item_bank_id: bank.item_bank_id,
      bank_name: bank.bank_name,
      description: bank.description,
      duration: bank.duration,
      is_active: bank.is_active,
      total_items: itemsWithDetails.length,
      items: itemsWithDetails
    };
  }

  async findOne(id: number) {
    const bank = await this.bankRepo.findOne({
      where: { item_bank_id: id }
    });

    if (!bank) {
      throw new NotFoundException(`Item bank with ID ${id} not found`);
    }

    // ดึง categories
    const categoryRelations = await this.itemBankCategoryRepo.find({
      where: { item_bank_id: id },
      relations: ['category']
    });

    const categories = categoryRelations.map(rel => rel.category);

    return {
      ...bank,
      item_bank_id: bank.item_bank_id, // เพิ่ม alias เพื่อให้ตรงกับ frontend (data.bank_id)
      categories: categories
    };
  }

  async update(id: number, updateItemsBankDto: UpdateItemsBankDto) {
    const { category_ids, ...bankData } = updateItemsBankDto;
    const oldBank = await this.bankRepo.findOneBy({ item_bank_id: id });

    if (bankData.is_active) {
      const totalItems = await this.itemBankItemRepo.count({
        where: { item_bank_id: id },
      });
      const totalSituations = await this.situationRepo.count({
        where: { item_bank_id: id },
      });
      if (totalItems === 0 && totalSituations === 0) {
        throw new BadRequestException('ต้องมีอย่างน้อย 1 คำถาม/สถานการณ์ ถึงจะสามารถเปิดใช้งานชุดข้อสอบได้');
      }
    }

    // Update bank data
    await this.bankRepo.update({ item_bank_id: id }, bankData);

    // Update categories if provided
    if (category_ids) {
      // Delete old relations
      await this.itemBankCategoryRepo.delete({ item_bank_id: id });

      // Add new relations
      if (category_ids.length > 0) {
        const categoryRelations = category_ids.map(category_id =>
          this.itemBankCategoryRepo.create({
            item_bank_id: id,
            category_id: category_id
          })
        );
        await this.itemBankCategoryRepo.save(categoryRelations);
      }
    }

    const updatedBank = await this.findOne(id);

    // แจ้งเตือนเมื่อเปลี่ยนสถานะจาก ปิด เป็น เปิด
    if (oldBank && !oldBank.is_active && updatedBank.is_active) {
      // ดึง entity หลักเพื่อส่งให้ notify method
      const bankEntity = await this.bankRepo.findOneBy({ item_bank_id: id });
      if (bankEntity) {
        this.notifyAllUsersNewExamBank(bankEntity).catch(err =>
          console.error('Failed to send exam bank notifications on update:', err)
        );
      }
    }

    return updatedBank;
  }


  async remove(id: number) {
    const queryRunner = this.bankRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. ลบความสัมพันธ์อื่นๆ ของ Item Bank
      await this.itemBankCategoryRepo.delete({ item_bank_id: id });
      await this.itemBankItemRepo.delete({ item_bank_id: id });

      // 2. Soft Delete Situations และ Items ภายใต้ Item Bank นี้
      const situations = await this.situationRepo.find({ where: { item_bank_id: id } });
      for (const situation of situations) {
        const itemsInSituation = await this.itemRepo.find({ where: { situation_id: situation.situation_id } });

        for (const item of itemsInSituation) {
          await queryRunner.manager.softDelete(Item, { item_id: item.item_id });
        }

        await queryRunner.manager.softDelete(ItemSituation, { situation_id: situation.situation_id });
      }

      // 3. Soft Delete Item Bank
      const result = await queryRunner.manager.softDelete(ItemsBank, { item_bank_id: id });

      await queryRunner.commitTransaction();

      return {
        message: (result.affected ?? 0) > 0 ? 'ลบคลังข้อสอบสำเร็จ' : 'ไม่พบคลังข้อสอบที่ต้องการลบ',
        success: (result.affected ?? 0) > 0
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * กู้คืนคลังข้อสอบที่ถูก Soft Delete พร้อมสถานการณ์และคำถามที่เกี่ยวข้อง
   */
  async restoreBank(id: number) {
    const queryRunner = this.bankRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Restore Item Bank
      await queryRunner.manager.restore(ItemsBank, { item_bank_id: id });

      // 2. Restore Situations และ Items ภายใต้ Item Bank นี้
      const situations = await this.situationRepo.find({
        where: { item_bank_id: id },
        withDeleted: true
      });

      for (const situation of situations) {
        await queryRunner.manager.restore(ItemSituation, { situation_id: situation.situation_id });
        const itemsInSituation = await this.itemRepo.find({
          where: { situation_id: situation.situation_id },
          withDeleted: true
        });

        for (const item of itemsInSituation) {
          await queryRunner.manager.restore(Item, { item_id: item.item_id });
        }
      }

      // 3. Restore direct items in item_bank_items if any
      const bankItems = await this.itemBankItemRepo.find({ where: { item_bank_id: id } });
      for (const bi of bankItems) {
        await queryRunner.manager.restore(Item, { item_id: bi.item_id });
      }

      await queryRunner.commitTransaction();

      return {
        message: 'กู้คืนคลังข้อสอบสำเร็จ',
        success: true,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * ลบคลังข้อสอบอย่างถาวร (Permanent Hard Delete) ออกจากฐานข้อมูล
   */
  async hardDeleteBank(id: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const bankItems = await this.itemBankItemRepo.find({ where: { item_bank_id: id } });
      const itemIdsFromBankItems = bankItems.map(bi => bi.item_id);

      const situations = await this.situationRepo.find({ where: { item_bank_id: id }, withDeleted: true });
      const situationIds = situations.map(s => s.situation_id);

      let itemIdsFromSituations: number[] = [];
      if (situationIds.length > 0) {
        const itemsInSituations = await this.itemRepo.find({
          where: { situation_id: In(situationIds) },
          withDeleted: true
        });
        itemIdsFromSituations = itemsInSituations.map(i => i.item_id);
      }

      const allItemIds = Array.from(new Set([...itemIdsFromBankItems, ...itemIdsFromSituations]));
      const sessions = await this.examSessionRepo.find({ where: { itemBankId: id } });
      const sessionIds = sessions.map(s => s.session_id);

      if (allItemIds.length > 0) {
        await queryRunner.query(`DELETE FROM answer_options WHERE item_id = ANY($1)`, [allItemIds]);
        await queryRunner.query(`DELETE FROM item_sub_topics WHERE item_id = ANY($1)`, [allItemIds]);
        await queryRunner.query(`DELETE FROM user_item_mastery WHERE item_id = ANY($1)`, [allItemIds]);
        await queryRunner.query(`DELETE FROM item_answers WHERE item_id = ANY($1)`, [allItemIds]);
        await queryRunner.query(`DELETE FROM item_bank_items WHERE item_id = ANY($1) OR item_bank_id = $2`, [allItemIds, id]);
        await queryRunner.query(`DELETE FROM items WHERE item_id = ANY($1)`, [allItemIds]);
      } else {
        await queryRunner.manager.delete(ItemBankItem, { item_bank_id: id });
      }

      if (sessionIds.length > 0) {
        await queryRunner.query(`DELETE FROM item_answers WHERE session_id = ANY($1)`, [sessionIds]);
        await queryRunner.query(`DELETE FROM exam_sessions WHERE session_id = ANY($1) OR item_bank_id = $2`, [sessionIds, id]);
      } else {
        await queryRunner.manager.delete(ExamSession, { itemBankId: id });
      }

      if (situationIds.length > 0) {
        await queryRunner.query(`DELETE FROM item_situations WHERE situation_id = ANY($1) OR item_bank_id = $2`, [situationIds, id]);
      } else {
        await queryRunner.manager.delete(ItemSituation, { item_bank_id: id });
      }

      await queryRunner.manager.delete(ItemBankCategory, { item_bank_id: id });
      const result = await queryRunner.manager.delete(ItemsBank, { item_bank_id: id });

      await queryRunner.commitTransaction();

      return {
        message: (result.affected ?? 0) > 0 ? 'ลบคลังข้อสอบถาวรสำเร็จ' : 'ไม่พบคลังข้อสอบที่ต้องการลบ',
        success: (result.affected ?? 0) > 0
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Error hard deleting item bank:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteSituation(situation_id: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // หาคำถามทั้งหมดในสถานการณ์นี้
      const items = await this.itemRepo.find({ where: { situation_id } });

      // Soft Delete คำถามแต่ละข้อในสถานการณ์นี้
      for (const item of items) {
        await queryRunner.manager.softDelete(Item, { item_id: item.item_id });
      }

      // Soft Delete สถานการณ์
      const result = await queryRunner.manager.softDelete(ItemSituation, { situation_id });

      await queryRunner.commitTransaction();

      return {
        message: (result.affected ?? 0) > 0 ? 'ลบสถานการณ์สำเร็จ' : 'ไม่พบสถานการณ์ที่ต้องการลบ',
        success: (result.affected ?? 0) > 0,
        deleted_items: items.length
      };

    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('Error deleting situation:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateSituation(situation_id: number, updateData: Partial<CreateSituationDto>) {
    const situation = await this.situationRepo.findOne({ where: { situation_id } });

    if (!situation) {
      throw new NotFoundException(`ไม่พบสถานการณ์ ID ${situation_id}`);
    }

    await this.situationRepo.update({ situation_id }, updateData);

    return {
      message: 'อัพเดทสถานการณ์สำเร็จ',
      situation: await this.situationRepo.findOne({ where: { situation_id } })
    };
  }

  async updateItem(item_id: number, updateData: any) {
    const item = await this.itemRepo.findOne({ where: { item_id } });

    if (!item) {
      throw new NotFoundException(`ไม่พบคำถาม ID ${item_id}`);
    }

    // แยกข้อมูลที่ไม่ใช่ของ item entity
    const { sub_topic_id, sub_topic_ids, answer_options, ...itemData } = updateData;

    // Update item
    await this.itemRepo.update({ item_id }, itemData);

    // Update sub_topic หรือ sub_topic_ids ถ้ามีการเปลี่ยนแปลง
    if (sub_topic_ids !== undefined) {
      // ลบ sub_topic เก่า
      await this.itemSubTopicRepo.delete({ item_id });

      // เพิ่ม sub_topics ใหม่ทั้งหมด (ถ้ามี)
      if (Array.isArray(sub_topic_ids) && sub_topic_ids.length > 0) {
        const itemSubTopics = sub_topic_ids.map(id =>
          this.itemSubTopicRepo.create({
            item_id,
            sub_topic_id: Number(id)
          })
        );
        await this.itemSubTopicRepo.save(itemSubTopics);
      }
    } else if (sub_topic_id !== undefined) {
      // ลบ sub_topic เก่า
      await this.itemSubTopicRepo.delete({ item_id });

      // เพิ่ม sub_topic ใหม่ (ถ้ามี)
      if (sub_topic_id) {
        const itemSubTopic = this.itemSubTopicRepo.create({
          item_id,
          sub_topic_id: Number(sub_topic_id)
        });
        await this.itemSubTopicRepo.save(itemSubTopic);
      }
    }    // Update answer options ถ้ามี
    if (answer_options && Array.isArray(answer_options)) {
      // ดึงตัวเลือกคำตอบที่มีอยู่เดิม
      const existingOptions = await this.answerOptionRepo.find({ where: { item_id } });
      const existingIds = existingOptions.map(opt => opt.option_id);

      // รวบรวม ID ที่ส่งมา (ถ้ามี)
      const incomingIds = answer_options
        .map((opt: any) => opt.option_id)
        .filter((id: any) => id);

      // ลบตัวเลือกที่ไม่อยู่ในรายการที่ส่งมา
      const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        await this.answerOptionRepo.delete(idsToDelete);
      }

      // อัพเดทหรือสร้างใหม่
      for (const option of answer_options) {
        if (option.option_id && existingIds.includes(option.option_id)) {
          // มี ID เดิมอยู่แล้ว -> Update
          await this.answerOptionRepo.update(
            { option_id: option.option_id },
            {
              option_text: option.option_text,
              is_correct: option.is_correct,
              option_image_url: option.option_image_url || null
            }
          );
        } else {
          // ไม่มี ID หรือเป็น ID ใหม่ -> Create
          const newOption = this.answerOptionRepo.create({
            item_id,
            option_text: option.option_text,
            is_correct: option.is_correct,
            option_image_url: option.option_image_url || null
          });
          await this.answerOptionRepo.save(newOption);
        }
      }
    }

    return {
      message: 'อัพเดทคำถามสำเร็จ',
      item: await this.itemRepo.findOne({ where: { item_id } })
    };
  }

  /**
   * ลบคำถาม (Item) แบบ Soft Delete
   * เพื่อรักษาสถิติการตอบของผู้ใช้ (user_item_mastery) และประวัติการทำข้อสอบไว้
   */
  async deleteItem(item_id: number) {
    const item = await this.itemRepo.findOne({ where: { item_id } });

    if (!item) {
      throw new NotFoundException(`ไม่พบคำถาม ID ${item_id}`);
    }

    // Soft Delete ตัวคำถาม (TypeORM จะเติม timestamp ใน deleted_at)
    const result = await this.itemRepo.softDelete({ item_id });

    return {
      message: (result.affected ?? 0) > 0 ? 'ลบคำถามสำเร็จ' : 'ไม่พบคำถามที่ต้องการลบ',
      success: (result.affected ?? 0) > 0,
      item_id
    };
  }


  // ==================== Exam Management ====================

  async startExam(userId: number, startExamDto: StartExamDto) {
    const { item_bank_id } = startExamDto;

    // ตรวจสอบว่า item bank มีอยู่จริง
    const itemBank = await this.bankRepo.findOne({ where: { item_bank_id } });
    if (!itemBank) {
      throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${item_bank_id}`);
    }

    // สร้าง exam session ใหม่

    const session = this.examSessionRepo.create({
      userId: userId,
      itemBankId: item_bank_id,
      session_type: 'NORMAL'
    });

    const savedSession = await this.examSessionRepo.save(session);

    return {
      message: 'เริ่มทำข้อสอบสำเร็จ',
      session_id: Number(savedSession.session_id),
      item_bank_id: savedSession.itemBankId,
      start_time: savedSession.start_time
    };
  }

  async cancelExam(userId: number, sessionId: number) {
    // ดึง Session ออกมาตรวจสอบก่อน
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any }
    });

    if (!session) {
      return { message: 'ไม่มี session ที่ต้องลบ', cancelled: false };
    }

    // ตรวจสอบว่าเป็นเจ้าของหรือไม่
    if (session.userId !== userId) {
      throw new UnauthorizedException('คุณไม่มีสิทธิ์ยกเลิก session นี้');
    }

    // ถ้า submit แล้ว (มี end_time) ให้ ignore
    if (session.end_time) {
      return { message: 'session นี้จบไปแล้ว ไม่สามารถยกเลิกได้', cancelled: false };
    }

    // ลบ session (responses อยู่ใน JSONB แล้ว ไม่ต้อง delete แยก)
    await this.examSessionRepo.delete({ session_id: sessionId });

    return {
      message: 'ยกเลิกการสอบสำเร็จ — ไม่บันทึกประวัติ',
      cancelled: true,
    };
  }

  async submitExam(userId: number, sessionId: number, submitExamDto: SubmitExamDto) {
    // ค้นหา Session และตรวจสอบสิทธิ์
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any }
    });

    if (!session) {
      throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedException(`คุณไม่มีสิทธิ์เข้าถึง session ID ${sessionId}`);
    }
    if (session.end_time) {
      throw new BadRequestException('ข้อสอบชุดนี้ถูกส่งไปแล้ว ไม่สามารถส่งซ้ำได้');
    }

    const { answers } = submitExamDto;
    let correctCount = 0;
    const totalQuestions = answers.length;
    const responsesArray: any[] = [];

    // ดึงข้อมูลคำถามทั้งหมดพร้อมกัน (batch) แทนการดึงทีละข้อ
    const itemIds = answers.map(a => a.item_id);
    const items = await this.itemRepo.find({
      where: { item_id: In(itemIds) },
      relations: ['answer_options']
    });
    const itemMap = new Map(items.map(i => [i.item_id, i]));

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const item = itemMap.get(answer.item_id);
      if (!item) continue;

      const correctOption = item.answer_options?.find(opt => opt.is_correct);
      const selectedId = answer.selected_option_id ? Number(answer.selected_option_id) : null;
      const correctId = correctOption?.option_id ? Number(correctOption.option_id) : null;
      const isCorrect = selectedId === correctId;
      if (isCorrect) correctCount++;

      // เพิ่ม response เข้า array (เก็บเฉพาะข้อมูลที่จำเป็นสำหรับ NORMAL exam)
      responsesArray.push({
        item_id: answer.item_id,
        selected_option_id: selectedId,
        correct_option_id: correctId,
        is_correct: isCorrect,
        order_presented: i + 1,
        response_time_ms: answer.response_time_ms || 0,
      });

      // อัพเดทสถิติการตอบคำถามของผู้ใช้
      await this.updateUserItemMastery(userId, answer.item_id, isCorrect);
    }

    // คำนวณคะแนน และอัพเดท session ทีเดียว
    const finalScore = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    await this.examSessionRepo.update(
      { session_id: sessionId as any },
      {
        end_time: new Date(),
        final_score: finalScore,
        responses: responsesArray,
      }
    );

    return {
      message: 'ส่งข้อสอบสำเร็จ',
      session_id: sessionId,
      total_questions: totalQuestions,
      correct_count: correctCount,
      final_score: finalScore,
      percentage: Math.round(finalScore * 100) / 100
    };
  }

  /**
   * อัพเดทสถิติการตอบคำถามของผู้ใช้
   */
  async updateUserItemMastery(
    userId: number,
    itemId: number,
    isCorrect: boolean,
  ) {
    // ตรวจสอบว่าเคยมีข้อมูลหรือยัง
    let mastery = await this.userItemMasteryRepo.findOne({
      where: { user_id: userId, item_id: itemId }
    });

    if (mastery) {
      // มีข้อมูลแล้ว - อัพเดท
      mastery.total_attempts += 1;

      if (isCorrect) {
        mastery.total_correct += 1;
        mastery.correct_streak += 1;
      } else {
        mastery.total_incorrect += 1;
        mastery.correct_streak = 0; // รีเซ็ต streak
      }

      mastery.last_answered_at = new Date();

      await this.userItemMasteryRepo.save(mastery);
    } else {
      // ยังไม่มีข้อมูล - สร้างใหม่
      mastery = this.userItemMasteryRepo.create({
        user_id: userId,
        item_id: itemId,
        total_attempts: 1,
        total_correct: isCorrect ? 1 : 0,
        total_incorrect: isCorrect ? 0 : 1,
        correct_streak: isCorrect ? 1 : 0,
        last_answered_at: new Date()
      });

      await this.userItemMasteryRepo.save(mastery);
    }

    return mastery;
  }

  async getExamResult(userId: number, sessionId: number) {
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any },
      relations: ['item_bank']
    });

    if (!session) {
      throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedException(`คุณไม่มีสิทธิ์เข้าถึงผลการสอบของ session ID ${sessionId}`);
    }

    // อ่าน responses จาก JSONB
    const storedResponses: any[] = session.responses || [];
    const totalQuestions = storedResponses.length;
    const correctCount = storedResponses.filter(r => r.is_correct).length;

    // ดึงข้อมูลจากตาราง items เพิ่มเติม (batch)
    const itemIds = storedResponses.map(r => r.item_id);
    const items = await this.itemRepo.find({
      where: { item_id: In(itemIds) },
      relations: ['answer_options', 'situation']
    });
    const itemMap = new Map(items.map(i => [i.item_id, i]));

    // วิเคราะห์สถิติตามหัวข้อ
    const topicStats = new Map<string, { topic_id: number, topic_name: string, sub_topics: Map<number, { sub_topic_id: number, sub_topic_name: string, correct: number, total: number }> }>();

    const responsesWithDetails = await Promise.all(
      storedResponses.map(async (r) => {
        const item = itemMap.get(r.item_id);

        const itemSubTopics = await this.itemSubTopicRepo.find({
          where: { item_id: r.item_id },
          relations: ['sub_topic', 'sub_topic.topic']
        });

        itemSubTopics.forEach(ist => {
          if (ist.sub_topic && ist.sub_topic.topic) {
            const topicKey = `${ist.sub_topic.topic.topic_id}`;
            if (!topicStats.has(topicKey)) {
              topicStats.set(topicKey, {
                topic_id: ist.sub_topic.topic.topic_id,
                topic_name: ist.sub_topic.topic.topic_name,
                sub_topics: new Map()
              });
            }
            const topicData = topicStats.get(topicKey);
            if (!topicData) return;
            const subTopicKey = ist.sub_topic.sub_topic_id;
            if (!topicData.sub_topics.has(subTopicKey)) {
              topicData.sub_topics.set(subTopicKey, {
                sub_topic_id: ist.sub_topic.sub_topic_id,
                sub_topic_name: ist.sub_topic.sub_topic_name,
                correct: 0,
                total: 0
              });
            }
            const subTopicData = topicData.sub_topics.get(subTopicKey);
            if (!subTopicData) return;
            subTopicData.total += 1;
            if (r.is_correct) subTopicData.correct += 1;
          }
        });

        return {
          item_id: r.item_id,
          question_text: item?.question_text,
          question_image_url: item?.question_image_url,
          explanation: item?.explanation,
          selected_option_id: r.selected_option_id,
          correct_option_id: r.correct_option_id,
          is_correct: r.is_correct,
          response_time_ms: r.response_time_ms,
          answer_options: item?.answer_options,
          situation: item?.situation,
          sub_topics: itemSubTopics.map(ist => ({
            sub_topic_id: ist.sub_topic.sub_topic_id,
            sub_topic_name: ist.sub_topic.sub_topic_name,
            topic: {
              topic_id: ist.sub_topic.topic.topic_id,
              topic_name: ist.sub_topic.topic.topic_name
            }
          }))
        };
      })
    );

    const topicAnalysis = Array.from(topicStats.values()).map(topic => {
      const subTopicsArray = Array.from(topic.sub_topics.values()).map(st => ({
        sub_topic_id: st.sub_topic_id,
        sub_topic_name: st.sub_topic_name,
        correct: st.correct,
        total: st.total,
        accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0
      }));
      const topicCorrect = subTopicsArray.reduce((sum, st) => sum + st.correct, 0);
      const topicTotal = subTopicsArray.reduce((sum, st) => sum + st.total, 0);
      return {
        topic_id: topic.topic_id,
        topic_name: topic.topic_name,
        correct: topicCorrect,
        total: topicTotal,
        accuracy: topicTotal > 0 ? Math.round((topicCorrect / topicTotal) * 100) : 0,
        sub_topics: subTopicsArray.sort((a, b) => a.accuracy - b.accuracy)
      };
    }).sort((a, b) => a.accuracy - b.accuracy);

    return {
      session_id: sessionId,
      item_bank_name: session.item_bank?.bank_name ?? null,
      status: session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
      start_time: session.start_time,
      end_time: session.end_time,
      total_questions: totalQuestions,
      correct_count: correctCount,
      final_score: session.final_score,
      responses: responsesWithDetails,
      topic_analysis: topicAnalysis
    };
  }

  async getUserExamHistory(
    userId: number,
    filters?: {
    category_ids?: number[];
    item_bank_id?: number;
    status?: 'ALL' | 'COMPLETED' | 'IN_PROGRESS';
    exam_type?: 'ALL' | 'NORMAL' | 'CAT';
  }) {
    const examType = filters?.exam_type || 'ALL';
    const allHistory: any[] = [];

    // 1. ดึงประวัติการสอบปกติ (Normal Exam)
    if (examType === 'ALL' || examType === 'NORMAL') {
      let query = this.examSessionRepo
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.item_bank', 'item_bank')
        .where('session.userId = :userId', { userId })
        .andWhere('session.session_type = :sessionType', { sessionType: 'NORMAL' })
        .andWhere('session.end_time IS NOT NULL');

      if (filters?.item_bank_id) {
        query = query.andWhere('session.itemBankId = :itemBankId', {
          itemBankId: filters.item_bank_id
        });
      }

      if (filters?.category_ids && filters.category_ids.length > 0) {
        query = query
          .innerJoin(
            'item_bank_category',
            'ibc',
            'ibc.item_bank_id = item_bank.item_bank_id'
          )
          .andWhere('ibc.category_id IN (:...categoryIds)', {
            categoryIds: filters.category_ids
          });
      }

      const sessions = await query.orderBy('session.start_time', 'DESC').getMany();

      const normalHistory = await Promise.all(
        sessions.map(async (session) => {
          // itemBankId อาจเป็น null (CAT session ที่ไม่ผูกกับคลัง)
          const categoryRelations = session.itemBankId
            ? await this.itemBankCategoryRepo.find({
                where: { item_bank_id: session.itemBankId! },
                relations: ['category']
              })
            : [];

          const responses = session.responses ?? [];
          const totalQ = responses.length;
          const correctCount = responses.filter((r: any) => r.is_correct).length;

          return {
            session_id: Number(session.session_id),
            item_bank_id: session.itemBankId,
            item_bank_name: session.item_bank?.bank_name ?? null,
            status: 'COMPLETED',
            start_time: session.start_time,
            end_time: session.end_time,
            final_score: session.final_score,
            total_questions: totalQ,
            correct_count: correctCount,
            exam_type: 'NORMAL',
            categories: categoryRelations.map(cr => ({
              category_id: cr.category.category_id,
              category_name: cr.category.category_name
            }))
          };
        })
      );
      allHistory.push(...normalHistory);
    }

    // 2. ดึงประวัติการสอบ CAT
    if (examType === 'ALL' || examType === 'CAT') {
      let catQuery = this.catSessionRepo
        .createQueryBuilder('cat')
        .leftJoinAndMapOne('cat.item_bank', ItemsBank, 'item_bank', 'item_bank.item_bank_id = cat.item_bank_id')
        .where('cat.user_id = :userId', { userId })
        .andWhere('cat.end_time IS NOT NULL');

      if (filters?.item_bank_id) {
        catQuery = catQuery.andWhere('cat.item_bank_id = :itemBankId', {
          itemBankId: filters.item_bank_id
        });
      }

      const catSessions = await catQuery.orderBy('cat.start_time', 'DESC').getMany();

      const catHistory = await Promise.all(
        catSessions.map(async (session: any) => {
          let categories: { category_id: number, category_name: string }[] = [];
          if (session.item_bank_id) {
            const categoryRelations = await this.itemBankCategoryRepo.find({
              where: { item_bank_id: session.item_bank_id },
              relations: ['category']
            });
            categories = categoryRelations.map(cr => ({
              category_id: cr.category.category_id,
              category_name: cr.category.category_name
            }));
          }

          return {
            session_id: session.session_id,
            item_bank_id: session.item_bank_id,
            item_bank_name: session.item_bank?.bank_name || 'การสอบ CAT แบบกำหนดเอง',
            status: 'COMPLETED',
            start_time: session.start_time,
            end_time: session.end_time,
            // ใน CAT เราอาจจะใช้ theta คำนวณเป็น score หรือใช้ passed/failed (ในที่นี้ใช้ theta หรือ default 0)
            final_score: session.final_theta !== null ? (session.passed ? 100 : 0) : 0,
            theta: session.final_theta,
            passed: session.passed,
            exam_type: 'CAT',
            categories: categories
          };
        })
      );

      // กรอง CAT ตามหมวดหมู่ถ้ามีการเลือก
      let filteredCatHistory = catHistory;
      if (filters?.category_ids && filters.category_ids.length > 0) {
        const targetCategoryIds = filters.category_ids;
        filteredCatHistory = catHistory.filter(cat =>
          cat.categories.some(c => targetCategoryIds.includes(c.category_id))
        );
      }

      allHistory.push(...filteredCatHistory);
    }

    // เรียงลำดับรวมทั้งหมดตามวันที่เริ่มสอบใหม่ไปเก่า
    return allHistory.sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );
  }

  /**
   * ดึงรายการ categories ที่ผู้ใช้เคยทำข้อสอบ
   */
  async getUserExamCategories(userId: number) {
    // ดึง session ทั้งหมดของ user
    const sessions = await this.examSessionRepo.find({
      where: { userId: userId },
      select: ['itemBankId']
    });

    // ดึง item_bank_id ที่ไม่ซ้ำ
    const itemBankIds = [...new Set(sessions.map(s => s.itemBankId))];

    if (itemBankIds.length === 0) {
      return [];
    }

    // ดึง categories ของ item banks เหล่านั้น
    const categoryRelations = await this.itemBankCategoryRepo
      .createQueryBuilder('ibc')
      .innerJoinAndSelect('ibc.category', 'category')
      .where('ibc.item_bank_id IN (:...itemBankIds)', { itemBankIds })
      .getMany();

    // ดึง categories ที่ไม่ซ้ำ
    const uniqueCategories = new Map();
    categoryRelations.forEach(rel => {
      if (!uniqueCategories.has(rel.category.category_id)) {
        uniqueCategories.set(rel.category.category_id, {
          category_id: rel.category.category_id,
          category_name: rel.category.category_name,
          category_description: rel.category.category_description
        });
      }
    });

    return Array.from(uniqueCategories.values());
  }


  /**
   * ดึงสถิติการตอบคำถามของผู้ใช้
   */
  async getUserItemMastery(userId: number, itemId?: number) {
    if (itemId) {
      // ดูสถิติของข้อเฉพาะ
      return this.userItemMasteryRepo.findOne({
        where: { user_id: userId, item_id: itemId }
      });
    } else {
      // ดูสถิติทั้งหมดของผู้ใช้
      return this.userItemMasteryRepo.find({
        where: { user_id: userId },
        order: { last_answered_at: 'DESC' }
      });
    }
  }


  // ==================== CAT Management Methods ====================

  /**
   * ดึงข้อสอบทั้งหมดที่มี IRT parameters ครบ พร้อมข้อมูล item bank
   */
  async getItemsWithIRTParameters() {
    const allItemBankItems = await this.itemBankItemRepo.find({
      relations: ['item', 'item.answer_options', 'item.situation', 'item_bank'],
      order: { item_bank_id: 'ASC', display_order: 'ASC' },
    });

    const itemsWithIRT = allItemBankItems.filter((bbi) => {
      const item = bbi.item;
      return this.isValidIRTItem(item);
    });

    return itemsWithIRT.map((bbi) => ({
      item_id: bbi.item.item_id,
      question_text: bbi.item.question_text,
      irt_a_discrimination: bbi.item.irt_a_discrimination,
      irt_b_difficulty: bbi.item.irt_b_difficulty,
      irt_c_guessing: bbi.item.irt_c_guessing,
      explanation: bbi.item.explanation,
      status: bbi.item.status,
      display_order: bbi.display_order,
      situation: bbi.item.situation
        ? {
          situation_id: bbi.item.situation.situation_id,
          situation_text: bbi.item.situation.situation_text,
          situation_image_url: bbi.item.situation.situation_image_url,
        }
        : null,
      item_bank: {
        item_bank_id: bbi.item_bank.item_bank_id,
        bank_name: bbi.item_bank.bank_name,
        description: bbi.item_bank.description,
      },
      answer_options: bbi.item.answer_options?.map((opt) => ({
        option_id: opt.option_id,
        option_text: opt.option_text,
        is_correct: opt.is_correct,
      })),
    }));
  }

  /**
   * ดึงข้อสอบที่มี IRT parameters ในชุดข้อสอบเฉพาะ
   */
  async getItemBankItemsWithIRT(itemBankId: number) {
    const itemBank = await this.bankRepo.findOne({
      where: { item_bank_id: itemBankId },
    });

    if (!itemBank) {
      throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${itemBankId}`);
    }

    const itemBankItems = await this.itemBankItemRepo.find({
      where: { item_bank_id: itemBankId },
      relations: ['item', 'item.answer_options', 'item.situation'],
      order: { display_order: 'ASC' },
    });

    const itemsWithIRT = itemBankItems.filter((bbi) =>
      this.isValidIRTItem(bbi.item),
    );

    const itemsWithoutIRT = itemBankItems.filter(
      (bbi) => !this.isValidIRTItem(bbi.item),
    );

    return {
      item_bank_id: itemBankId,
      bank_name: itemBank.bank_name,
      total_items: itemBankItems.length,
      items_with_irt: itemsWithIRT.length,
      items_without_irt: itemsWithoutIRT.length,
      readiness_percentage: Math.round(
        (itemsWithIRT.length / itemBankItems.length) * 100,
      ),
      items: itemsWithIRT.map((bbi) => ({
        item_id: bbi.item.item_id,
        question_text: bbi.item.question_text,
        irt_a_discrimination: bbi.item.irt_a_discrimination,
        irt_b_difficulty: bbi.item.irt_b_difficulty,
        irt_c_guessing: bbi.item.irt_c_guessing,
        explanation: bbi.item.explanation,
        status: bbi.item.status,
        display_order: bbi.display_order,
        situation: bbi.item.situation
          ? {
            situation_id: bbi.item.situation.situation_id,
            situation_text: bbi.item.situation.situation_text,
          }
          : null,
        answer_options: bbi.item.answer_options?.map((opt) => ({
          option_id: opt.option_id,
          option_text: opt.option_text,
          is_correct: opt.is_correct,
        })),
      })),
      items_missing_irt: itemsWithoutIRT.map((bbi) => ({
        item_id: bbi.item.item_id,
        question_text:
          bbi.item.question_text?.substring(0, 100) + '...',
        missing_params: this.getMissingIRTParams(bbi.item),
      })),
    };
  }

  /**
   * อัพเดท IRT parameters แบบ batch
   */
  async batchUpdateIRTParameters(updateData: {
    updates: Array<{
      item_id: number;
      irt_a_discrimination: number;
      irt_b_difficulty: number;
      irt_c_guessing: number;
    }>;
  }) {
    const results: {
      success: Array<{ item_id: number; message: string }>;
      failed: Array<{ item_id: number; reason: string }>;
    } = {
      success: [],
      failed: [],
    };

    for (const update of updateData.updates) {
      try {
        const item = await this.itemRepo.findOne({
          where: { item_id: update.item_id },
        });

        if (!item) {
          results.failed.push({
            item_id: update.item_id,
            reason: 'ไม่พบข้อสอบ',
          });
          continue;
        }

        // Validate IRT parameters
        if (
          update.irt_a_discrimination <= 0 ||
          update.irt_c_guessing < 0 ||
          update.irt_c_guessing >= 1
        ) {
          results.failed.push({
            item_id: update.item_id,
            reason: 'IRT parameters ไม่ถูกต้อง',
          });
          continue;
        }

        // Update
        await this.itemRepo.update(
          { item_id: update.item_id },
          {
            irt_a_discrimination: update.irt_a_discrimination,
            irt_b_difficulty: update.irt_b_difficulty,
            irt_c_guessing: update.irt_c_guessing,
          },
        );

        results.success.push({
          item_id: update.item_id,
          message: 'อัพเดทสำเร็จ',
        });
      } catch (error) {
        results.failed.push({
          item_id: update.item_id,
          reason: error.message,
        });
      }
    }

    return {
      message: 'Batch update completed',
      total: updateData.updates.length,
      success_count: results.success.length,
      failed_count: results.failed.length,
      results,
    };
  }

  /**
   * ดู CAT readiness summary ของทุก item banks
   */
  async getCATReadinessSummary() {
    const allBanks = await this.bankRepo.find({
      order: { item_bank_id: 'ASC' },
    });

    const summary = await Promise.all(
      allBanks.map(async (bank) => {
        const itemBankItems = await this.itemBankItemRepo.find({
          where: { item_bank_id: bank.item_bank_id },
          relations: ['item'],
        });

        const totalItems = itemBankItems.length;
        const itemsWithIRT = itemBankItems.filter((bbi) =>
          this.isValidIRTItem(bbi.item),
        ).length;
        const itemsWithoutIRT = totalItems - itemsWithIRT;

        const readinessPercentage =
          totalItems > 0 ? Math.round((itemsWithIRT / totalItems) * 100) : 0;
        const isReady = itemsWithIRT >= 20; // MIN_ITEMS_FOR_CAT

        return {
          item_bank_id: bank.item_bank_id,
          bank_name: bank.bank_name,
          total_items: totalItems,
          items_with_irt: itemsWithIRT,
          items_without_irt: itemsWithoutIRT,
          readiness_percentage: readinessPercentage,
          is_ready: isReady,
          status: isReady
            ? '✅ พร้อมใช้'
            : itemsWithIRT > 0
              ? `⚠️ ยังไม่พร้อม (${itemsWithIRT}/20)`
              : '❌ ยังไม่มี IRT parameters',
        };
      }),
    );

    const totalReady = summary.filter((s) => s.is_ready).length;
    const totalNotReady = summary.length - totalReady;

    return {
      total_item_banks: summary.length,
      ready_for_cat: totalReady,
      not_ready: totalNotReady,
      overall_percentage: Math.round((totalReady / summary.length) * 100),
      item_banks: summary,
    };
  }

  /**
   * ตรวจสอบว่าข้อสอบมี IRT parameters ครบ
   */
  private isValidIRTItem(item: Item): boolean {
    if (
      item.irt_a_discrimination == null ||
      item.irt_b_difficulty == null ||
      item.irt_c_guessing == null
    ) {
      return false;
    }

    if (
      !isFinite(item.irt_a_discrimination) ||
      !isFinite(item.irt_b_difficulty) ||
      !isFinite(item.irt_c_guessing)
    ) {
      return false;
    }

    if (item.irt_a_discrimination <= 0) {
      return false;
    }

    if (item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
      return false;
    }

    return true;
  }

  /**
   * หา IRT parameters ที่หายไป
   */
  private getMissingIRTParams(item: Item): string[] {
    const missing: string[] = [];

    if (
      item.irt_a_discrimination == null ||
      !isFinite(item.irt_a_discrimination) ||
      item.irt_a_discrimination <= 0
    ) {
      missing.push('a (discrimination)');
    }
    if (item.irt_b_difficulty == null || !isFinite(item.irt_b_difficulty)) {
      missing.push('b (difficulty)');
    }
    if (
      item.irt_c_guessing == null ||
      !isFinite(item.irt_c_guessing) ||
      item.irt_c_guessing < 0 ||
      item.irt_c_guessing >= 1
    ) {
      missing.push('c (guessing)');
    }

    return missing;
  }



  /**
   * ดึงข้อมูลสถิติภาพรวมของ Item Bank สำหรับ Dashboard
   */
  async getDashboardStats(itemBankId: number) {
    // 1. ตรวจสอบว่ามี Item Bank อยู่จริง
    const bank = await this.bankRepo.findOne({ where: { item_bank_id: itemBankId } });
    if (!bank) {
      throw new NotFoundException(`Item bank with ID ${itemBankId} not found`);
    }

    // 2. ดึงจำนวนข้อสอบทั้งหมด
    const totalItems = await this.itemBankItemRepo.count({
      where: { item_bank_id: itemBankId }
    });

    // 3. ดึงจำนวนครั้งที่มีผู้เข้าสอบ (Sessions)
    const totalAttempts = await this.examSessionRepo.count({
      where: { itemBankId: itemBankId, end_time: In([(null as any), undefined]) ? undefined : undefined } // Count all attempts or completed only? Let's count all valid sessions first. actually let's filter completed items for stats
    });

    // Count only completed sessions for score stats
    const completedSessions = await this.examSessionRepo.find({
      where: { itemBankId: itemBankId, end_time: In([(null as any)]) ? undefined : undefined }, // This query needs to check NOT NULL for end_time. TypeORM shorthand for NOT NULL is simply not providing null, but let's be explicit with query builder if needed.
      // Simplify: find all and filter in memory or use query builder. Query builder is better.
    });

    // Find completed sessions using query builder for better performance and correctness
    const completedSessionsBuilder = this.examSessionRepo.createQueryBuilder('session')
      .where('session.itemBankId = :itemBankId', { itemBankId })
      .andWhere('session.end_time IS NOT NULL');

    const completedCount = await completedSessionsBuilder.getCount();
    const completedSessionsData = await completedSessionsBuilder.getMany();

    // 4. คำนวณคะแนนเฉลี่ย
    let averageScore = 0;
    let maxScore = 0;
    let minScore = 0;
    let passCount = 0; // สมมติเกณฑ์ผ่าน 60%

    // Score distribution (range of 10)
    const scoreDistribution = Array(10).fill(0).map((_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}%`,
      count: 0
    }));

    if (completedCount > 0) {
      const scores = completedSessionsData.map(s => s.final_score);
      const sumScore = scores.reduce((a, b) => a + b, 0);
      averageScore = sumScore / completedCount;
      maxScore = Math.max(...scores);
      minScore = Math.min(...scores);

      const passThreshold = 50; // 50%
      passCount = scores.filter(s => s >= passThreshold).length;

      // Calculate distribution
      scores.forEach(score => {
        const index = Math.min(Math.floor(score / 10), 9);
        scoreDistribution[index].count++;
      });
    }

    const passRate = completedCount > 0 ? (passCount / completedCount) * 100 : 0;

    // 5. ดึง categories
    const categoryRelations = await this.itemBankCategoryRepo.find({
      where: { item_bank_id: itemBankId },
      relations: ['category']
    });

    const categories = categoryRelations.map(rel => ({
      category_id: rel.category.category_id,
      category_name: rel.category.category_name
    }));

    // 6. Recent Activity (Latest 10 sessions)
    const recentActivityRaw = await this.examSessionRepo.find({
      where: { itemBankId: itemBankId },
      order: { start_time: 'DESC' },
      take: 10,
      relations: ['user']
    });

    const recentActivity = recentActivityRaw.map(session => ({
      session_id: session.session_id,
      user_id: session.userId,
      user_name: (() => {
        if (!session.user) return `User #${session.userId}`;
        const fName = (session.user.first_name || '').trim();
        const lName = (session.user.last_name || '').trim();
        if (!fName && !lName) return `User #${session.userId}`;
        const maskedFirst = fName.length <= 2
          ? (fName.charAt(0) || '*') + '*'.repeat(Math.max(1, fName.length - 1))
          : fName.substring(0, 2) + '*'.repeat(Math.max(1, fName.length - 2));
        const maskedLast = lName.length > 0
          ? lName.charAt(0) + '*'.repeat(Math.max(1, lName.length - 1))
          : '';
        return maskedLast ? `${maskedFirst} ${maskedLast}` : maskedFirst;
      })(),
      start_time: session.start_time,
      end_time: session.end_time,
      score: session.final_score,
      status: session.end_time ? 'COMPLETED' : 'IN_PROGRESS'
    }));

    return {
      item_bank: {
        id: bank.item_bank_id,
        name: bank.bank_name,
        created_at: bank.created_at, // ส่ง created_at กลับไปด้วย
        updated_at: bank.updated_at,
        duration: bank.duration,
        is_active: bank.is_active,
        categories: categories.map(c => ({ category_id: c.category_id, category_name: c.category_name })) // Map ให้ตรง format
      },
      stats: {
        total_items: totalItems,
        total_attempts: totalAttempts, // All sessions created
        completed_attempts: completedCount, // Only finished exams
        average_score: Math.round(averageScore * 100) / 100,
        max_score: Math.round(maxScore * 100) / 100,
        min_score: Math.round(minScore * 100) / 100,
        pass_rate: Math.round(passRate * 100) / 100,
      },
      charts: {
        score_distribution: scoreDistribution
      },
      recent_activity: recentActivity
    };
  }
}
