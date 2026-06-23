import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CATSession } from './entities/cat-session.entity';
import { IRTService, IRTResponse } from './irt.service';
import { CATService } from './cat.service';
import { StartCATExamDto, SubmitCATAnswerDto } from './dto/cat-exam.dto';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CATExamService {
    constructor(
        @InjectRepository(ExamSession)
        private readonly sessionRepo: Repository<ExamSession>,
        @InjectRepository(CATSession)
        private readonly catSessionRepo: Repository<CATSession>,
        @InjectRepository(ItemsBank)
        private readonly itemsBankRepo: Repository<ItemsBank>,
        @InjectRepository(ItemBankItem)
        private readonly itemBankItemRepo: Repository<ItemBankItem>,
        @InjectRepository(Item)
        private readonly itemRepo: Repository<Item>,
        @InjectRepository(AnswerOption)
        private readonly answerOptionRepo: Repository<AnswerOption>,
        @InjectRepository(ItemSubTopic)
        private readonly itemSubTopicRepo: Repository<ItemSubTopic>,
        @InjectRepository(Topic)
        private readonly topicRepo: Repository<Topic>,
        private readonly irtService: IRTService,
        private readonly catService: CATService,
        private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * เริ่มการสอบ CAT
     */
    async startCATExam(userId: number, startExamDto: StartCATExamDto) {
        const { min_items, max_items, target_se, cut_score, initial_theta, topic_proportions } =
            startExamDto;

        // ดึงค่า theta จาก session ก่อนหน้าของ user เพื่อใช้เป็น Bayesian prior
        // (ถ้า user ระบุ initial_theta มาด้วยตัวเองก็ใช้ตามนั้น)
        let priorTheta = initial_theta ?? null;
        if (priorTheta === null || priorTheta === undefined) {
            const lastAbility = await this.getLatestAbility(userId);
            priorTheta = lastAbility.has_history ? lastAbility.theta : 0.0;
        }

        // 1. สร้าง Session ตัวหลัก (Base)
        // CAT ดึงจาก global pool เสมอ → itemBankId = null เสมอ
        const baseSession = this.sessionRepo.create({
            userId: userId,
            itemBankId: null,
            session_type: 'CAT',
            start_time: new Date(),
        });
        const savedBase = await this.sessionRepo.save(baseSession);

        // 2. สร้าง CAT session เฉพาะทาง (Detail)
        const catSessionData = this.catSessionRepo.create({
            session_id: Number(savedBase.session_id),
            userId: userId,
            current_theta: priorTheta,
            prior_theta: priorTheta,
            current_se: 999.0,
            num_items: 0,
            num_correct: 0,
            used_item_ids: [],
            responses: [],
            min_items: min_items || 20,
            max_items: max_items || 50,
            target_se: target_se || 0.35,
            cut_score: cut_score || 0.0,
            topic_proportions: topic_proportions || null,
        });

        const savedCATSession = await this.catSessionRepo.save(catSessionData);

        // เลือกข้อแรกจาก global pool (ไม่ filter ตาม item bank)
        const firstItem = await this.selectFirstItemForSession(savedCATSession);

        if (!firstItem) {
            throw new NotFoundException('ไม่มีข้อสอบในระบบที่มี IRT parameters ครบ');
        }

        // อัพเดท session ด้วยข้อแรก
        savedCATSession.current_item_id = firstItem.item_id;
        savedCATSession.used_item_ids = [firstItem.item_id];
        await this.catSessionRepo.save(savedCATSession);

        return {
            message: 'เริ่มการสอบ CAT สำเร็จ',
            session_id: Number(savedBase.session_id),
            current_item: firstItem,
            current_theta: savedCATSession.current_theta,
            current_se: savedCATSession.current_se,
            num_items: savedCATSession.num_items,
            start_time: savedBase.start_time,
        };
    }

    /**
     * เลือกข้อแรกสำหรับ session
     */
    private async selectFirstItemForSession(session: CATSession, itemBankId?: number) {
        const itemBank = await this.getAvailableItemsWithTopics(itemBankId);

        if (session.topic_proportions) {
            const targetTopicId = this.selectNextTopicId(session, [], itemBank);
            if (targetTopicId) {
                const filtered = itemBank.filter((i) => i.topic_id === targetTopicId);
                if (filtered.length > 0) {
                    const usedItemIds = new Set<number>(session.used_item_ids || []);
                    const firstItem = this.catService.selectFirstItem(filtered, usedItemIds);
                    if (firstItem) return this.enrichItemWithOptions(firstItem);
                }
            }
        }

        const usedItemIds = new Set<number>(session.used_item_ids || []);
        const firstItem = this.catService.selectFirstItem(itemBank, usedItemIds);

        if (!firstItem) return null;
        return this.enrichItemWithOptions(firstItem);
    }

    private async enrichItemWithOptions(item: any) {
        const answerOptions = await this.answerOptionRepo.find({
            where: { item_id: item.item_id },
            order: { option_id: 'ASC' },
        });

        return {
            ...item,
            answer_options: answerOptions,
        };
    }

    /**
     * ดึงข้อสอบที่พร้อมใช้งาน พร้อมข้อมูล Topic
     */
    private async getAvailableItemsWithTopics(itemBankId?: number) {
        const query = this.itemRepo
            .createQueryBuilder('item')
            .leftJoinAndSelect('item.item_sub_topics', 'ist')
            .leftJoinAndSelect('ist.sub_topic', 'st')
            .leftJoinAndSelect('item.situation', 'situation')
            .where('item.irt_a_discrimination > 0')
            .andWhere('item.irt_b_difficulty IS NOT NULL')
            .andWhere('item.irt_c_guessing IS NOT NULL')
            .andWhere("item.status = 'published'");

        if (itemBankId) {
            query
                .innerJoin(
                    ItemBankItem,
                    'ibi',
                    'ibi.item_id = item.item_id AND ibi.item_bank_id = :itemBankId',
                    { itemBankId },
                );
        }

        const items = await query.getMany();

        return items.map((item) => {
            const topicId = (item as any).item_sub_topics?.[0]?.sub_topic?.topic_id;
            return {
                ...item,
                topic_id: topicId,
            };
        });
    }

    /**
     * คำนวณว่าควรเลือกข้อสอบจากหัวข้อใดถัดไปเพื่อให้ได้สัดส่วนตามที่กำหนด
     */
    private selectNextTopicId(
        session: CATSession,
        currentResponses: any[],
        itemsWithTopics: any[],
    ): number | null {
        if (!session.topic_proportions) return null;

        const targetProportions = session.topic_proportions; // { "1": 50, "2": 50 }
        const totalItems = currentResponses.length;

        if (totalItems === 0) {
            const sortedTopics = Object.entries(targetProportions).sort(
                (a, b) => (b[1] as number) - (a[1] as number),
            );
            return parseInt(sortedTopics[0][0]);
        }

        const currentCounts: Record<number, number> = {};
        for (const resp of currentResponses) {
            const item = itemsWithTopics.find((i) => i.item_id === resp.item_id);
            if (item && item.topic_id) {
                currentCounts[item.topic_id] = (currentCounts[item.topic_id] || 0) + 1;
            }
        }

        let bestTopicId: number | null = null;
        let maxDeficit = -1000;

        for (const [topicIdStr, weight] of Object.entries(targetProportions)) {
            const topicId = parseInt(topicIdStr);
            const targetCount = ((weight as number) / 100) * (totalItems + 1);
            const currentCount = currentCounts[topicId] || 0;
            const deficit = targetCount - currentCount;

            if (deficit > maxDeficit) {
                maxDeficit = deficit;
                bestTopicId = topicId;
            }
        }

        return bestTopicId;
    }

    /**
     * ดึงคลังข้อสอบทั้งหมด และ Filter เฉพาะข้อที่มี IRT parameters ครบ
     */
    private async getItemBankItems(itemBankId: number) {
        const itemBankItems = await this.itemBankItemRepo.find({
            where: { item_bank_id: itemBankId },
            relations: ['item'],
            order: { display_order: 'ASC' },
        });

        // Filter เฉพาะข้อที่มี IRT parameters ครบและถูกต้อง
        const validItems = itemBankItems
            .map((bbi) => bbi.item)
            .filter((item) => this.isValidIRTItem(item));

        return validItems;
    }

    /**
     * ตรวจสอบว่าข้อสอบมี IRT parameters ครบและถูกต้อง
     */
    private isValidIRTItem(item: Item): boolean {
        // ตรวจสอบว่ามีค่า IRT parameters ทั้ง 3 ตัว
        if (
            item.irt_a_discrimination == null ||
            item.irt_b_difficulty == null ||
            item.irt_c_guessing == null
        ) {
            return false;
        }

        // ตรวจสอบว่าค่าไม่เป็น NaN หรือ Infinity
        if (
            !isFinite(item.irt_a_discrimination) ||
            !isFinite(item.irt_b_difficulty) ||
            !isFinite(item.irt_c_guessing)
        ) {
            return false;
        }

        // ตรวจสอบว่าค่าอยู่ในช่วงที่เหมาะสม
        // a (discrimination): ควรมากกว่า 0 (โดยทั่วไป 0.5-2.5)
        // b (difficulty): ควรอยู่ระหว่าง -4 ถึง 4
        // c (guessing): ควรอยู่ระหว่าง 0 ถึง 1
        if (item.irt_a_discrimination <= 0) {
            return false;
        }

        if (item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
            return false;
        }

        return true;
    }

    /**
     * ตรวจสอบว่า item bank พร้อมสำหรับ CAT หรือไม่
     */
    private async validateItemBankForCAT(itemBankId: number, minItems: number) {
        const validItems = await this.getItemBankItems(itemBankId);

        if (validItems.length === 0) {
            throw new NotFoundException(
                `คลังข้อสอบนี้ไม่มีข้อสอบที่มี IRT parameters (a, b, c) ครบ ไม่สามารถใช้กับระบบ CAT ได้`,
            );
        }

        if (validItems.length < minItems) {
            throw new NotFoundException(
                `คลังข้อสอบนี้มีข้อสอบที่ระบุ IRT parameters ครบเพียง ${validItems.length} ข้อ ` +
                `ไม่เพียงพอสำหรับ CAT (ต้องการอย่างน้อย ${minItems} ข้อ)`,
            );
        }

        return validItems;
    }

    /**
     * รับข้อสอบข้อถัดไป
     */
    async getNextItem(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        if (session.base_session.end_time) {
            throw new NotFoundException('Session นี้จบแล้ว');
        }

        // ดึงข้อปัจจุบัน
        const currentItem = await this.itemRepo.findOne({
            where: { item_id: session.current_item_id },
            relations: ['situation'],
        });

        if (!currentItem) {
            throw new NotFoundException('ไม่พบข้อสอบ');
        }

        const answerOptions = await this.answerOptionRepo.find({
            where: { item_id: currentItem.item_id },
            order: { option_id: 'ASC' },
        });

        return {
            session_id: session.session_id,
            current_item: {
                ...currentItem,
                answer_options: answerOptions,
            },
            current_theta: session.current_theta,
            current_se: session.current_se,
            num_items: session.num_items,
            min_items: session.min_items,
            max_items: session.max_items,
        };
    }

    /**
     * ส่งคำตอบและเลือกข้อถัดไป
     */
    async submitAnswer(userId: number, submitAnswerDto: SubmitCATAnswerDto) {
        const { session_id, item_id, selected_option_id, response_time_ms } =
            submitAnswerDto;

        const session = await this.catSessionRepo.findOne({
            where: { session_id },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${session_id}`);
        }

        if (session.base_session.end_time) {
            throw new NotFoundException('Session นี้จบแล้ว');
        }

        // ดึงข้อมูลข้อสอบ
        const item = await this.itemRepo.findOne({ where: { item_id } });
        if (!item) {
            throw new NotFoundException(`ไม่พบข้อสอบ ID ${item_id}`);
        }

        // ตรวจสอบคำตอบ
        const correctOption = await this.answerOptionRepo.findOne({
            where: { item_id, is_correct: true },
        });

        const isCorrect = selected_option_id === correctOption?.option_id;

        // บันทึก response
        const response = {
            item_id,
            selected_option_id,
            is_correct: isCorrect,
            response_time_ms: response_time_ms || 0,
            theta_before: session.current_theta,
            timestamp: new Date(),
        };

        const responses = [...(session.responses || []), response];

        // อัพเดทจำนวนข้อและคะแนน
        session.num_items += 1;
        if (isCorrect) session.num_correct += 1;

        // ประมาณค่า theta ใหม่ (FETCH IRT PARAMS FOR ALL PAST ITEMS CORRECTLY)
        const itemIds = responses.map((r) => r.item_id);
        const historyItems = await this.itemRepo.find({
            where: { item_id: In(itemIds) },
        });
        const itemMap = new Map(historyItems.map((i) => [i.item_id, i]));

        const irtResponses: IRTResponse[] = responses
            .map((r) => {
                const i = itemMap.get(r.item_id);
                if (i && this.isValidIRTItem(i)) {
                    return {
                        item: {
                            a: i.irt_a_discrimination!,
                            b: i.irt_b_difficulty!,
                            c: i.irt_c_guessing!,
                        },
                        isCorrect: r.is_correct,
                    };
                }
                return null;
            })
            .filter((r) => r !== null) as IRTResponse[];

        const estimation = this.irtService.estimateThetaEAP(
            irtResponses,
            session.prior_theta ?? 0.0,  // Bayesian prior mean จาก session ก่อนหน้า
            1.0,                          // prior SD = 1 (standard)
        );
        session.current_theta = estimation.theta;
        session.current_se = estimation.se;

        // อัพเดท response ด้วย theta หลังตอบ
        response['theta_after'] = session.current_theta;
        response['se_after'] = session.current_se;

        session.responses = responses;

        // ตรวจสอบเงื่อนไขหยุด
        const stoppingRule = this.catService.checkStoppingRule(
            session.current_theta,
            session.current_se,
            session.num_items,
            {
                minItems: session.min_items,
                maxItems: session.max_items,
                targetSE: session.target_se,
                cutScore: session.cut_score,
            },
        );

        if (stoppingRule.shouldStop) {
            // จบการสอบ

            const now = new Date();
            // อัพเดทเวลาจบที่ฐานหลัก
            await this.sessionRepo.update(session.session_id, {
                end_time: now,
            });
            session.final_theta = session.current_theta;
            session.final_se = session.current_se;
            session.passed = this.catService.makeDecision(
                session.final_theta,
                session.cut_score,
            );
            session.stop_reason = stoppingRule.reason;
            session.current_item_id = undefined;

            await this.catSessionRepo.save(session);

            // แจ้งเตือนเมื่อสอบเสร็จ
            try {
                await this.notificationsService.create({
                    user_id: session.base_session.userId,
                    title: session.passed ? 'ยินดีด้วย! คุณสอบผ่าน CAT 🎉' : 'สอบ CAT เสร็จสิ้น 💪',
                    message: `คุณทำข้อสอบไปทั้งหมด ${session.num_items} ข้อ ค่าความสามารถสุดท้าย (θ) คือ ${session.current_theta.toFixed(2)}`,
                    notification_type_id: session.passed ? 2 : 1,
                    link_url: `/user/cat-exam/result/${session.session_id}`
                });
            } catch (error) {
                console.error('Error sending CAT completion notification:', error);
            }

            return {
                message: 'จบการสอบ',
                finished: true,
                session_id: session.session_id,
                final_theta: session.final_theta,
                final_se: session.final_se,
                num_items: session.num_items,
                num_correct: session.num_correct,
                passed: session.passed,
                stop_reason: session.stop_reason,
            };
        } else {
            // เลือกข้อถัดไปจาก global pool (CAT ไม่ผูกกับ item bank ใด)
            const itemBankWithTopics = await this.getAvailableItemsWithTopics();
            const usedItemIds = new Set<number>(session.used_item_ids);

            let eligibleItems = itemBankWithTopics.filter(
                (i) => !usedItemIds.has(i.item_id),
            );

            // ใช้ Topic Balancing ถ้ากำหนดไว้
            if (session.topic_proportions) {
                const targetTopicId = this.selectNextTopicId(
                    session,
                    responses,
                    itemBankWithTopics,
                );
                if (targetTopicId) {
                    const filtered = eligibleItems.filter(
                        (i) => i.topic_id === targetTopicId,
                    );
                    if (filtered.length > 0) {
                        eligibleItems = filtered;
                    }
                }
            }

            const nextItem = this.catService.selectNextItem(
                session.current_theta,
                eligibleItems,
                new Set(), // eligible คือ filtered แล้ว ไม่ต้องกรองซ้ำ
                session.num_items,       // สำหรับ a-stratified
                session.max_items,       // สำหรับ a-stratified
            );

            if (!nextItem) {
                // ไม่มีข้อเหลือ ต้องจบ

                const now = new Date();
                // อัพเดทเวลาจบที่ฐานหลัก
                await this.sessionRepo.update(session.session_id, {
                    end_time: now,
                });
                session.final_theta = session.current_theta;
                session.final_se = session.current_se;
                session.passed = this.catService.makeDecision(
                    session.final_theta,
                    session.cut_score,
                );
                session.stop_reason = 'ไม่มีข้อสอบเหลือในคลัง';
                session.current_item_id = undefined;

                await this.catSessionRepo.save(session);

                // แจ้งเตือนเมื่อสอบเสร็จ (กรณีข้อสอบหมด)
                try {
                    await this.notificationsService.create({
                        user_id: session.base_session.userId,
                        title: session.passed ? 'ยินดีด้วย! คุณสอบผ่าน CAT 🎉' : 'สอบ CAT เสร็จสิ้น 💪',
                        message: `คุณทำข้อสอบไปทั้งหมด ${session.num_items} ข้อ (คลังข้อสอบหมด) ค่าความสามารถสุดท้าย (θ) คือ ${session.current_theta.toFixed(2)}`,
                        notification_type_id: session.passed ? 2 : 1,
                        link_url: `/user/cat-exam/result/${session.session_id}`
                    });
                } catch (error) {
                    console.error('Error sending CAT completion notification:', error);
                }

                return {
                    message: 'จบการสอบ (ไม่มีข้อเหลือ)',
                    finished: true,
                    session_id: session.session_id,
                    final_theta: session.final_theta,
                    final_se: session.final_se,
                    num_items: session.num_items,
                    num_correct: session.num_correct,
                    passed: session.passed,
                    stop_reason: session.stop_reason,
                };
            }

            // อัพเดท session
            session.current_item_id = nextItem.item_id;
            session.used_item_ids = [...usedItemIds, nextItem.item_id];
            await this.catSessionRepo.save(session);

            // โหลด answer options
            const answerOptions = await this.answerOptionRepo.find({
                where: { item_id: nextItem.item_id },
                order: { option_id: 'ASC' },
            });

            return {
                message: 'ส่งคำตอบสำเร็จ',
                finished: false,
                is_correct: isCorrect,
                session_id: session.session_id,
                current_theta: session.current_theta,
                current_se: session.current_se,
                num_items: session.num_items,
                next_item: {
                    ...nextItem,
                    answer_options: answerOptions,
                },
            };
        }
    }

    /**
     * ดูผลการสอบ
     */
    async getExamResult(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        // itemBankId อาจเป็น null → ไม่ต้อง query
        const itemBank = session.base_session.itemBankId
            ? await this.itemsBankRepo.findOne({
                where: { item_bank_id: session.base_session.itemBankId! },
            })
            : null;

        // Fetch full item details for each response to show answers and explanations
        const responsesWithDetails = await Promise.all((session.responses || []).map(async (resp: any) => {
            const item = await this.itemRepo.findOne({
                where: { item_id: resp.item_id },
                relations: ['answer_options', 'situation']
            });
            return {
                ...resp,
                question_text: item?.question_text,
                question_image_url: item?.question_image_url,
                explanation: item?.explanation,
                situation: item?.situation,
                answer_options: item?.answer_options,
                // IRT parameters — used by frontend to draw Item Information & Difficulty charts
                irt_a: item?.irt_a_discrimination ?? null,
                irt_b: item?.irt_b_difficulty ?? null,
                irt_c: item?.irt_c_guessing ?? null,
            };
        }));

        // วิเคราะห์สถิติตามหัวข้อ (เหมือน normal exam)
        const topicStats = new Map<string, {
            topic_id: number;
            topic_name: string;
            sub_topics: Map<number, { sub_topic_id: number; sub_topic_name: string; correct: number; total: number }>;
        }>();

        await Promise.all((session.responses || []).map(async (resp: any) => {
            const itemSubTopics = await this.itemSubTopicRepo.find({
                where: { item_id: resp.item_id },
                relations: ['sub_topic', 'sub_topic.topic'],
            });

            itemSubTopics.forEach(ist => {
                if (ist.sub_topic?.topic) {
                    const topicKey = `${ist.sub_topic.topic.topic_id}`;
                    if (!topicStats.has(topicKey)) {
                        topicStats.set(topicKey, {
                            topic_id: ist.sub_topic.topic.topic_id,
                            topic_name: ist.sub_topic.topic.topic_name,
                            sub_topics: new Map(),
                        });
                    }
                    const topicData = topicStats.get(topicKey)!;
                    const subTopicKey = ist.sub_topic.sub_topic_id;
                    if (!topicData.sub_topics.has(subTopicKey)) {
                        topicData.sub_topics.set(subTopicKey, {
                            sub_topic_id: ist.sub_topic.sub_topic_id,
                            sub_topic_name: ist.sub_topic.sub_topic_name,
                            correct: 0,
                            total: 0,
                        });
                    }
                    const subTopicData = topicData.sub_topics.get(subTopicKey)!;
                    subTopicData.total += 1;
                    if (resp.is_correct) subTopicData.correct += 1;
                }
            });
        }));

        const topicAnalysis = Array.from(topicStats.values()).map(topic => {
            const subTopicsArray = Array.from(topic.sub_topics.values()).map(st => ({
                sub_topic_id: st.sub_topic_id,
                sub_topic_name: st.sub_topic_name,
                correct: st.correct,
                total: st.total,
                accuracy: st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0,
            }));
            const topicCorrect = subTopicsArray.reduce((s, st) => s + st.correct, 0);
            const topicTotal = subTopicsArray.reduce((s, st) => s + st.total, 0);
            return {
                topic_id: topic.topic_id,
                topic_name: topic.topic_name,
                correct: topicCorrect,
                total: topicTotal,
                accuracy: topicTotal > 0 ? Math.round((topicCorrect / topicTotal) * 100) : 0,
                sub_topics: subTopicsArray.sort((a, b) => a.accuracy - b.accuracy),
            };
        }).sort((a, b) => a.accuracy - b.accuracy);

        return {
            session_id: Number(session.session_id),
            item_bank_name: itemBank?.bank_name,
            status: session.base_session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
            start_time: session.base_session.start_time,
            end_time: session.base_session.end_time,
            current_theta: session.current_theta,
            current_se: session.current_se,
            final_theta: session.final_theta,
            final_se: session.final_se,
            num_items: session.num_items,
            num_correct: session.num_correct,
            passed: session.passed,
            stop_reason: session.stop_reason,
            responses: responsesWithDetails,
            topic_analysis: topicAnalysis,
            pass_percentile: session.final_theta
                ? this.catService.calculatePassPercentile(session.final_theta)
                : null,
        };
    }


    /**
     * ดูประวัติการสอบ CAT
     */
    async getUserCATHistory(userId: number) {
        const sessions = await this.catSessionRepo.find({
            relations: ['base_session'],
            where: { base_session: { userId: userId } },
        });

        sessions.sort((a, b) => b.base_session.start_time.getTime() - a.base_session.start_time.getTime());

        return Promise.all(
            sessions.map(async (session) => {
                // itemBankId อาจเป็น null (CAT ที่ไม่ระบุคลัง)
                const itemBank = session.base_session.itemBankId
                    ? await this.itemsBankRepo.findOne({
                        where: { item_bank_id: session.base_session.itemBankId },
                    })
                    : null;

                return {
                    session_id: Number(session.session_id),
                    item_bank_id: session.base_session.itemBankId,
                    item_bank_name: itemBank?.bank_name,
                    status: session.base_session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
                    start_time: session.base_session.start_time,
                    end_time: session.base_session.end_time,
                    final_theta: session.final_theta,
                    num_items: session.num_items,
                    num_correct: session.num_correct,
                    passed: session.passed,
                };
            }),
        );
    }

    /**
     * ดูข้อมูล session ปัจจุบัน
     */
    async getCATSession(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        return session;
    }

    /**
     * ยกเลิก CAT session ออกกลางคัน — ลบออกจาก DB ไม่บันทึกประวัติ
     * (เหมือน normal exam pattern)
     */
    async cancelCATSession(userId: number, sessionId: number) {
        const session = await this.catSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        // ไม่มี session หรือ session จบแล้ว → ไม่ต้องทำอะไร
        if (!session) {
            return { message: 'ไม่มี session ที่ต้องลบ', cancelled: false };
        }
        if (session.base_session.userId !== userId) {
            return { message: 'ไม่มีสิทธิ์', cancelled: false };
        }
        if (session.base_session.end_time) {
            return { message: 'session นี้จบแล้ว ไม่สามารถยกเลิกได้', cancelled: false };
        }

        // ลบ cat_session ก่อน (FK → exam_sessions)
        await this.catSessionRepo.delete({ session_id: sessionId });
        // ลบ base exam_session ออกทันที ไม่บันทึกประวัติ
        await this.sessionRepo.delete({ session_id: sessionId });

        return { message: 'ยกเลิกการสอบ CAT สำเร็จ — ไม่บันทึกประวัติ', cancelled: true };
    }


    /**
     * ตรวจสอบว่า item bank พร้อมสำหรับ CAT หรือไม่
     */
    async checkCATReadiness(itemBankId: number) {
        // ตรวจสอบว่า item bank มีอยู่จริง
        const itemBank = await this.itemsBankRepo.findOne({
            where: { item_bank_id: itemBankId },
        });

        if (!itemBank) {
            throw new NotFoundException(`ไม่พบคลังข้อสอบ ID ${itemBankId}`);
        }

        // นับจำนวนข้อสอบทั้งหมด
        const allItems = await this.itemBankItemRepo.find({
            where: { item_bank_id: itemBankId },
            relations: ['item'],
        });

        const totalItems = allItems.length;

        // Filter ข้อที่มี IRT parameters ครบ
        const validItems = allItems
            .map((bbi) => bbi.item)
            .filter((item) => this.isValidIRTItem(item));

        const validItemsCount = validItems.length;
        const invalidItemsCount = totalItems - validItemsCount;

        // คำนวณเปอร์เซ็นต์
        const readinessPercentage = totalItems > 0
            ? Math.round((validItemsCount / totalItems) * 100)
            : 0;

        // ตรวจสอบว่าพร้อมใช้หรือไม่
        const MIN_ITEMS_FOR_CAT = 20;
        const isReady = validItemsCount >= MIN_ITEMS_FOR_CAT;

        // หาข้อที่ยังไม่มี IRT parameters (สำหรับแจ้งเตือน)
        const itemsWithoutIRT = allItems
            .map((bbi) => bbi.item)
            .filter((item) => !this.isValidIRTItem(item))
            .map((item) => ({
                item_id: item.item_id,
                question_text: item.question_text?.substring(0, 50) + '...',
                missing_params: this.getMissingIRTParams(item),
            }))
            .slice(0, 10); // แสดงแค่ 10 ข้อแรก

        return {
            item_bank_id: itemBankId,
            item_bank_name: itemBank.bank_name,
            is_ready: isReady,
            total_items: totalItems,
            valid_items: validItemsCount,
            invalid_items: invalidItemsCount,
            readiness_percentage: readinessPercentage,
            min_items_required: MIN_ITEMS_FOR_CAT,
            message: isReady
                ? `✅ คลังข้อสอบพร้อมใช้กับ CAT (มีข้อสอบที่มี IRT parameters ครบ ${validItemsCount} ข้อ)`
                : `❌ คลังข้อสอบยังไม่พร้อมใช้กับ CAT (มีข้อสอบที่มี IRT parameters ครบเพียง ${validItemsCount}/${MIN_ITEMS_FOR_CAT} ข้อ)`,
            items_without_irt: itemsWithoutIRT,
        };
    }

    /**
     * หา IRT parameters ที่หายไป
     */
    private getMissingIRTParams(item: Item): string[] {
        const missing: string[] = [];

        if (item.irt_a_discrimination == null || !isFinite(item.irt_a_discrimination) || item.irt_a_discrimination <= 0) {
            missing.push('a (discrimination)');
        }
        if (item.irt_b_difficulty == null || !isFinite(item.irt_b_difficulty)) {
            missing.push('b (difficulty)');
        }
        if (item.irt_c_guessing == null || !isFinite(item.irt_c_guessing) || item.irt_c_guessing < 0 || item.irt_c_guessing >= 1) {
            missing.push('c (guessing)');
        }

        return missing;
    }

    /**
     * ดึงค่าความสามารถล่าสุดของผู้ใช้
     */
    async getLatestAbility(userId: number) {
        const lastBaseSession = await this.sessionRepo
            .createQueryBuilder('session')
            .where('session.userId = :userId', { userId })
            .andWhere('session.session_type = :type', { type: 'CAT' })
            .andWhere('session.end_time IS NOT NULL')
            .orderBy('session.end_time', 'DESC')
            .getOne();

        if (!lastBaseSession) return { theta: 0.0, has_history: false };

        const lastSession = await this.catSessionRepo.findOne({
            where: { session_id: lastBaseSession.session_id }
        });


        return {
            theta: lastSession?.final_theta ?? 0.0,
            has_history: !!lastSession,
        };
    }

    // ==================== Admin Analytics ====================

    /**
     * [Admin] Session analytics overview
     */
    async getAdminAnalytics() {
        const sessions = await this.catSessionRepo.find({
            relations: ['base_session'],
        });

        // เฉพาะที่จบแล้ว
        const completedSessions = sessions.filter(s => s.base_session.end_time);

        const total = completedSessions.length;
        const passed = completedSessions.filter(s => s.passed).length;
        const failed = total - passed;
        const avgTheta = total > 0
            ? completedSessions.reduce((sum, s) => sum + (s.final_theta ?? 0), 0) / total
            : 0;
        const avgSE = total > 0
            ? completedSessions.reduce((sum, s) => sum + (s.final_se ?? 0), 0) / total
            : 0;
        const avgItems = total > 0
            ? completedSessions.reduce((sum, s) => sum + (s.num_items ?? 0), 0) / total
            : 0;

        // Theta distribution: bins of width 0.5 from -3 to 3
        const BINS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
        const thetaDist = BINS.slice(0, -1).map((lo, i) => {
            const hi = BINS[i + 1];
            const count = completedSessions.filter(s => {
                const t = s.final_theta ?? 0;
                return t >= lo && t < hi;
            }).length;
            return { range: `${lo}~${hi}`, count };
        });

        // Stop reason breakdown
        const stopReasons: Record<string, number> = {};
        completedSessions.forEach(s => {
            const r = s.stop_reason ?? 'unknown';
            stopReasons[r] = (stopReasons[r] ?? 0) + 1;
        });

        // Recent 10 sessions
        const recent = completedSessions
            .sort((a, b) => b.base_session.end_time.getTime() - a.base_session.end_time.getTime())
            .slice(0, 10)
            .map(s => ({
                session_id: Number(s.session_id),
                user_id: s.base_session.userId,
                final_theta: s.final_theta,
                final_se: s.final_se,
                num_items: s.num_items,
                passed: s.passed,
                stop_reason: s.stop_reason,
                end_time: s.base_session.end_time,
            }));

        return {
            total_sessions: total,
            passed,
            failed,
            pass_rate: total > 0 ? +((passed / total) * 100).toFixed(1) : 0,
            avg_theta: +avgTheta.toFixed(3),
            avg_se: +avgSE.toFixed(3),
            avg_items: +avgItems.toFixed(1),
            theta_distribution: thetaDist,
            stop_reason_breakdown: stopReasons,
            recent_sessions: recent,
        };
    }

    /**
     * [Admin] Item exposure report
     */
    async getItemExposureReport() {
        const sessions = await this.catSessionRepo.find({
            relations: ['base_session']
        });
        const completedSessions = sessions.filter(s => s.base_session.end_time);
        const totalSessions = completedSessions.length;

        const exposureMap: Record<number, { count: number; correct: number; item_id: number }> = {};
        completedSessions.forEach(session => {
            (session.responses || []).forEach((resp: any) => {
                if (!exposureMap[resp.item_id]) {
                    exposureMap[resp.item_id] = { item_id: resp.item_id, count: 0, correct: 0 };
                }
                exposureMap[resp.item_id].count++;
                if (resp.is_correct) exposureMap[resp.item_id].correct++;
            });
        });

        const items = await this.itemRepo.find();
        const itemMap = new Map(items.map(i => [i.item_id, i]));

        const report = Object.values(exposureMap)
            .map(e => {
                const item = itemMap.get(e.item_id);
                return {
                    item_id: e.item_id,
                    exposure_count: e.count,
                    exposure_rate: totalSessions > 0 ? +(e.count / totalSessions).toFixed(3) : 0,
                    correct_rate: e.count > 0 ? +(e.correct / e.count).toFixed(3) : 0,
                    irt_b: item?.irt_b_difficulty ?? null,
                    question_preview: item?.question_text?.substring(0, 60) ?? '',
                    flag_overexposed: totalSessions > 0 && (e.count / totalSessions) > 0.3,
                };
            })
            .sort((a, b) => b.exposure_count - a.exposure_count);

        return {
            total_sessions: totalSessions,
            total_unique_items: report.length,
            overexposed_count: report.filter(r => r.flag_overexposed).length,
            items: report,
        };
    }

    /**
     * [Admin] Test Information Function for a specific bank
     */
    async getBankTIF(bankId: number) {
        const bankItems = await this.itemBankItemRepo.find({
            where: { item_bank_id: bankId },
            relations: ['item'],
        });

        const validItems = bankItems
            .map(bi => bi.item)
            .filter(item => this.isValidIRTItem(item));

        const THETA_RANGE: number[] = [];
        for (let t = -4; t <= 4; t += 0.1) {
            THETA_RANGE.push(+t.toFixed(2));
        }

        const tifData = THETA_RANGE.map(theta => {
            const totalInfo = validItems.reduce((sum, item) => {
                const a = item.irt_a_discrimination!;
                const b = item.irt_b_difficulty!;
                const c = item.irt_c_guessing!;
                const P = c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
                const info = (a * a * Math.pow(P - c, 2) * (1 - P)) /
                    (Math.pow(1 - c, 2) * (P || 0.0001));
                return sum + info;
            }, 0);
            return { theta, info: +totalInfo.toFixed(4), se: totalInfo > 0 ? +(1 / Math.sqrt(totalInfo)).toFixed(4) : 9.99 };
        });

        const bank = await this.itemsBankRepo.findOne({ where: { item_bank_id: bankId } });
        return {
            bank_name: bank?.bank_name,
            num_items: validItems.length,
            tif: tifData,
        };
    }

    /**
     * [Admin] Trigger IRT calibration via python service
     */
    async triggerCalibration(bankId?: number) {
        try {
            const irtServiceUrl = process.env.IRT_SERVICE_URL || 'http://localhost:8001';
            const endpoint = `${irtServiceUrl}/calibrate${bankId ? `?bank_id=${bankId}` : ''}`;

            // Fire-and-forget style — don't await long calibration
            fetch(endpoint, { method: 'POST' }).catch(() => {
                // IRT service may be offline — just log
            });

            return {
                status: 'triggered',
                message: `IRT calibration triggered${bankId ? ` for bank ${bankId}` : ' for all banks'}`,
                irt_service_url: irtServiceUrl,
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'IRT calibration service could not be reached. Is irt_service running?',
            };
        }
    }
}
