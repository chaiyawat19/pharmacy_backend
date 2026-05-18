import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { ExamSession } from './entities/exam-session.entity';
import { Item } from './entities/items.entity';
import { ItemBankItem } from './entities/item_bank_items.entity';
import { ItemBankCategory } from './entities/item_bank_category.entity';
import { UserItemMastery } from './entities/user_item_mastery.entity';
import { ItemSubTopic } from './entities/item_sub_topics.entity';
import { ItemsBank } from './entities/items-bank.entity';
import { CATSession } from '../cat/entities/cat-session.entity';
import { StartExamDto, SubmitExamDto } from './dto/exam.dto';
import { ExamHistoryFilterDto } from './dto/exam-history-filter.dto';

@Injectable()
export class ExamService {
  constructor(
    @InjectRepository(ExamSession)
    private readonly examSessionRepo: Repository<ExamSession>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemBankItem)
    private readonly itemBankItemRepo: Repository<ItemBankItem>,
    @InjectRepository(ItemBankCategory)
    private readonly itemBankCategoryRepo: Repository<ItemBankCategory>,
    @InjectRepository(UserItemMastery)
    private readonly userItemMasteryRepo: Repository<UserItemMastery>,
    @InjectRepository(ItemSubTopic)
    private readonly itemSubTopicRepo: Repository<ItemSubTopic>,
    @InjectRepository(ItemsBank)
    private readonly bankRepo: Repository<ItemsBank>,
    @InjectRepository(CATSession)
    private readonly catSessionRepo: Repository<CATSession>,
  ) {}

  // ==================== Exam Session ====================

  async startExam(userId: number, startExamDto: StartExamDto) {
    const { item_bank_id } = startExamDto;

    const itemBank = await this.bankRepo.findOne({ where: { item_bank_id } });
    if (!itemBank) {
      throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${item_bank_id}`);
    }

    const session = this.examSessionRepo.create({
      userId: userId,
      itemBankId: item_bank_id,
      session_type: 'NORMAL',
    });

    const savedSession = await this.examSessionRepo.save(session);

    return {
      message: 'เริ่มทำข้อสอบสำเร็จ',
      session_id: Number(savedSession.session_id),
      item_bank_id: savedSession.itemBankId,
      start_time: savedSession.start_time,
    };
  }

  async cancelExam(userId: number, sessionId: number) {
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any },
    });

    if (!session) {
      return { message: 'ไม่มี session ที่ต้องลบ', cancelled: false };
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException('คุณไม่มีสิทธิ์ยกเลิก session นี้');
    }

    if (session.end_time) {
      return { message: 'session นี้จบไปแล้ว ไม่สามารถยกเลิกได้', cancelled: false };
    }

    await this.examSessionRepo.delete({ session_id: sessionId });

    return {
      message: 'ยกเลิกการสอบสำเร็จ — ไม่บันทึกประวัติ',
      cancelled: true,
    };
  }

  async submitExam(userId: number, sessionId: number, submitExamDto: SubmitExamDto) {
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any },
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

    const itemIds = answers.map((a) => a.item_id);
    const items = await this.itemRepo.find({
      where: { item_id: In(itemIds) },
      relations: ['answer_options'],
    });
    const itemMap = new Map(items.map((i) => [i.item_id, i]));

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const item = itemMap.get(answer.item_id);
      if (!item) continue;

      const correctOption = item.answer_options?.find((opt) => opt.is_correct);
      const selectedId = answer.selected_option_id ? Number(answer.selected_option_id) : null;
      const correctId = correctOption?.option_id ? Number(correctOption.option_id) : null;
      const isCorrect = selectedId === correctId;
      if (isCorrect) correctCount++;

      responsesArray.push({
        item_id: answer.item_id,
        selected_option_id: selectedId,
        correct_option_id: correctId,
        is_correct: isCorrect,
        order_presented: i + 1,
        response_time_ms: answer.response_time_ms || 0,
      });

      await this.updateUserItemMastery(userId, answer.item_id, isCorrect);
    }

    const finalScore = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    await this.examSessionRepo.update(
      { session_id: sessionId as any },
      {
        end_time: new Date(),
        final_score: finalScore,
        responses: responsesArray,
      },
    );

    return {
      message: 'ส่งข้อสอบสำเร็จ',
      session_id: sessionId,
      total_questions: totalQuestions,
      correct_count: correctCount,
      final_score: finalScore,
      percentage: Math.round(finalScore * 100) / 100,
    };
  }

  async getExamResult(userId: number, sessionId: number) {
    const session = await this.examSessionRepo.findOne({
      where: { session_id: sessionId as any },
      relations: ['item_bank'],
    });

    if (!session) {
      throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedException(
        `คุณไม่มีสิทธิ์เข้าถึงผลการสอบของ session ID ${sessionId}`,
      );
    }

    const storedResponses: any[] = session.responses || [];
    const totalQuestions = storedResponses.length;
    const correctCount = storedResponses.filter((r) => r.is_correct).length;

    const itemIds = storedResponses.map((r) => r.item_id);
    const items = await this.itemRepo.find({
      where: { item_id: In(itemIds) },
      relations: ['answer_options', 'situation'],
    });
    const itemMap = new Map(items.map((i) => [i.item_id, i]));

    const topicStats = new Map<
      string,
      {
        topic_id: number;
        topic_name: string;
        sub_topics: Map<
          number,
          { sub_topic_id: number; sub_topic_name: string; correct: number; total: number }
        >;
      }
    >();

    const responsesWithDetails = await Promise.all(
      storedResponses.map(async (r) => {
        const item = itemMap.get(r.item_id);

        const itemSubTopics = await this.itemSubTopicRepo.find({
          where: { item_id: r.item_id },
          relations: ['sub_topic', 'sub_topic.topic'],
        });

        itemSubTopics.forEach((ist) => {
          if (ist.sub_topic && ist.sub_topic.topic) {
            const topicKey = `${ist.sub_topic.topic.topic_id}`;
            if (!topicStats.has(topicKey)) {
              topicStats.set(topicKey, {
                topic_id: ist.sub_topic.topic.topic_id,
                topic_name: ist.sub_topic.topic.topic_name,
                sub_topics: new Map(),
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
                total: 0,
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
          explanation: item?.explanation,
          selected_option_id: r.selected_option_id,
          correct_option_id: r.correct_option_id,
          is_correct: r.is_correct,
          response_time_ms: r.response_time_ms,
          answer_options: item?.answer_options,
          situation: item?.situation,
          sub_topics: itemSubTopics.map((ist) => ({
            sub_topic_id: ist.sub_topic.sub_topic_id,
            sub_topic_name: ist.sub_topic.sub_topic_name,
            topic: {
              topic_id: ist.sub_topic.topic.topic_id,
              topic_name: ist.sub_topic.topic.topic_name,
            },
          })),
        };
      }),
    );

    const topicAnalysis = Array.from(topicStats.values())
      .map((topic) => {
        const subTopicsArray = Array.from(topic.sub_topics.values()).map((st) => ({
          sub_topic_id: st.sub_topic_id,
          sub_topic_name: st.sub_topic_name,
          correct: st.correct,
          total: st.total,
          accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0,
        }));
        const topicCorrect = subTopicsArray.reduce((sum, st) => sum + st.correct, 0);
        const topicTotal = subTopicsArray.reduce((sum, st) => sum + st.total, 0);
        return {
          topic_id: topic.topic_id,
          topic_name: topic.topic_name,
          correct: topicCorrect,
          total: topicTotal,
          accuracy: topicTotal > 0 ? Math.round((topicCorrect / topicTotal) * 100) : 0,
          sub_topics: subTopicsArray.sort((a, b) => a.accuracy - b.accuracy),
        };
      })
      .sort((a, b) => a.accuracy - b.accuracy);

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
      topic_analysis: topicAnalysis,
    };
  }

  async getUserExamHistory(userId: number, filters?: ExamHistoryFilterDto) {
    const examType = filters?.exam_type || 'ALL';
    const allHistory: any[] = [];

    // 1. ประวัติการสอบปกติ (Normal)
    if (examType === 'ALL' || examType === 'NORMAL') {
      let query = this.examSessionRepo
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.item_bank', 'item_bank')
        .where('session.userId = :userId', { userId })
        .andWhere('session.session_type = :sessionType', { sessionType: 'NORMAL' })
        .andWhere('session.end_time IS NOT NULL');

      if (filters?.item_bank_id) {
        query = query.andWhere('session.itemBankId = :itemBankId', {
          itemBankId: filters.item_bank_id,
        });
      }

      if (filters?.category_ids && filters.category_ids.length > 0) {
        query = query
          .innerJoin('item_bank_category', 'ibc', 'ibc.item_bank_id = item_bank.item_bank_id')
          .andWhere('ibc.category_id IN (:...categoryIds)', {
            categoryIds: filters.category_ids,
          });
      }

      const sessions = await query.orderBy('session.start_time', 'DESC').getMany();

      const normalHistory = await Promise.all(
        sessions.map(async (session) => {
          const categoryRelations = session.itemBankId
            ? await this.itemBankCategoryRepo.find({
                where: { item_bank_id: session.itemBankId! },
                relations: ['category'],
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
            categories: categoryRelations.map((cr) => ({
              category_id: cr.category.category_id,
              category_name: cr.category.category_name,
            })),
          };
        }),
      );
      allHistory.push(...normalHistory);
    }

    // 2. ประวัติการสอบ CAT
    if (examType === 'ALL' || examType === 'CAT') {
      let catQuery = this.catSessionRepo
        .createQueryBuilder('cat')
        .leftJoinAndMapOne(
          'cat.item_bank',
          ItemsBank,
          'item_bank',
          'item_bank.item_bank_id = cat.item_bank_id',
        )
        .where('cat.user_id = :userId', { userId })
        .andWhere('cat.end_time IS NOT NULL');

      if (filters?.item_bank_id) {
        catQuery = catQuery.andWhere('cat.item_bank_id = :itemBankId', {
          itemBankId: filters.item_bank_id,
        });
      }

      const catSessions = await catQuery.orderBy('cat.start_time', 'DESC').getMany();

      const catHistory = await Promise.all(
        catSessions.map(async (session: any) => {
          let categories: { category_id: number; category_name: string }[] = [];
          if (session.item_bank_id) {
            const categoryRelations = await this.itemBankCategoryRepo.find({
              where: { item_bank_id: session.item_bank_id },
              relations: ['category'],
            });
            categories = categoryRelations.map((cr) => ({
              category_id: cr.category.category_id,
              category_name: cr.category.category_name,
            }));
          }

          return {
            session_id: session.session_id,
            item_bank_id: session.item_bank_id,
            item_bank_name: session.item_bank?.bank_name || 'การสอบ CAT แบบกำหนดเอง',
            status: 'COMPLETED',
            start_time: session.start_time,
            end_time: session.end_time,
            final_score: session.final_theta !== null ? (session.passed ? 100 : 0) : 0,
            theta: session.final_theta,
            passed: session.passed,
            exam_type: 'CAT',
            categories,
          };
        }),
      );

      let filteredCatHistory = catHistory;
      if (filters?.category_ids && filters.category_ids.length > 0) {
        const targetCategoryIds = filters.category_ids;
        filteredCatHistory = catHistory.filter((cat) =>
          cat.categories.some((c) => targetCategoryIds.includes(c.category_id)),
        );
      }

      allHistory.push(...filteredCatHistory);
    }

    return allHistory.sort(
      (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );
  }

  async getUserExamCategories(userId: number) {
    const sessions = await this.examSessionRepo.find({
      where: { userId },
      select: ['itemBankId'],
    });

    const itemBankIds = [...new Set(sessions.map((s) => s.itemBankId))];

    if (itemBankIds.length === 0) {
      return [];
    }

    const categoryRelations = await this.itemBankCategoryRepo
      .createQueryBuilder('ibc')
      .innerJoinAndSelect('ibc.category', 'category')
      .where('ibc.item_bank_id IN (:...itemBankIds)', { itemBankIds })
      .getMany();

    const uniqueCategories = new Map();
    categoryRelations.forEach((rel) => {
      if (!uniqueCategories.has(rel.category.category_id)) {
        uniqueCategories.set(rel.category.category_id, {
          category_id: rel.category.category_id,
          category_name: rel.category.category_name,
          category_description: rel.category.category_description,
        });
      }
    });

    return Array.from(uniqueCategories.values());
  }

  // ==================== User Item Mastery ====================

  async updateUserItemMastery(userId: number, itemId: number, isCorrect: boolean) {
    let mastery = await this.userItemMasteryRepo.findOne({
      where: { user_id: userId, item_id: itemId },
    });

    if (mastery) {
      mastery.total_attempts += 1;
      if (isCorrect) {
        mastery.total_correct += 1;
        mastery.correct_streak += 1;
      } else {
        mastery.total_incorrect += 1;
        mastery.correct_streak = 0;
      }
      mastery.last_answered_at = new Date();
      await this.userItemMasteryRepo.save(mastery);
    } else {
      mastery = this.userItemMasteryRepo.create({
        user_id: userId,
        item_id: itemId,
        total_attempts: 1,
        total_correct: isCorrect ? 1 : 0,
        total_incorrect: isCorrect ? 0 : 1,
        correct_streak: isCorrect ? 1 : 0,
        last_answered_at: new Date(),
      });
      await this.userItemMasteryRepo.save(mastery);
    }

    return mastery;
  }

  async getUserItemMastery(userId: number, itemId?: number) {
    if (itemId) {
      return this.userItemMasteryRepo.findOne({
        where: { user_id: userId, item_id: itemId },
      });
    }
    return this.userItemMasteryRepo.find({
      where: { user_id: userId },
      order: { last_answered_at: 'DESC' },
    });
  }
}
