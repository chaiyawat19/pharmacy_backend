import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MSTSession } from './entities/mst-session.entity';
import { ExamSession } from '../items-bank/entities/exam-session.entity';
import { ItemsBank } from '../items-bank/entities/items-bank.entity';
import { ItemBankItem } from '../items-bank/entities/item_bank_items.entity';
import { Item } from '../items-bank/entities/items.entity';
import { AnswerOption } from '../items-bank/entities/answer_options.entity';
import { ItemSubTopic } from '../items-bank/entities/item_sub_topics.entity';
import { Topic } from '../topics/entities/topic.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { IRTService, IRTResponse } from '../cat/irt.service';
import { MSTRoutingService, MSTDifficultyLevel } from './mst-routing.service';
import { StartMSTExamDto, SubmitMSTStageDto } from './dto/mst-exam.dto';

@Injectable()
export class MSTService {
    constructor(
        @InjectRepository(ExamSession)
        private readonly sessionRepo: Repository<ExamSession>,
        @InjectRepository(MSTSession)
        private readonly mstSessionRepo: Repository<MSTSession>,
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
        private readonly mstRoutingService: MSTRoutingService,
        private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * เริ่มการสอบ MST
     */
    async startMSTExam(userId: number, startDto: StartMSTExamDto) {
        const {
            item_bank_id,
            total_stages = 2,
            items_per_stage = 12,
            cut_score = 0.0,
            initial_theta,
        } = startDto;

        // 1. ดึงค่า Prior Theta
        let priorTheta = initial_theta ?? null;
        if (priorTheta === null || priorTheta === undefined) {
            const lastAbility = await this.getLatestAbility(userId);
            priorTheta = lastAbility.has_history ? lastAbility.theta : 0.0;
        }

        // 2. สร้าง Base Session
        const baseSession = this.sessionRepo.create({
            userId,
            itemBankId: item_bank_id || null,
            session_type: 'MST',
            start_time: new Date(),
        });
        const savedBase = await this.sessionRepo.save(baseSession);

        // 3. ดึงคลังข้อสอบที่พร้อมใช้งาน
        const availableItems = await this.getAvailableItems(item_bank_id);

        if (availableItems.length === 0) {
            throw new NotFoundException('ไม่มีข้อสอบในระบบที่มี IRT parameters ครบ');
        }

        // 4. จัดข้อสอบสำหรับ Stage 1 (Routing Stage: Medium)
        const stage1Assembly = this.mstRoutingService.assembleStageItems(
            availableItems,
            new Set(),
            'medium',
            items_per_stage,
        );

        if (stage1Assembly.items.length === 0) {
            throw new NotFoundException('ไม่สามารถจัดชุดข้อสอบ Stage 1 ได้เนื่องจากข้อสอบไม่เพียงพอ');
        }

        // 5. บันทึก MST Session
        const routingPath = ['Stage 1: Routing (Medium)'];
        const stageItemsMap: Record<string, number[]> = {
            '1': stage1Assembly.item_ids,
        };

        const mstSession = this.mstSessionRepo.create({
            session_id: Number(savedBase.session_id),
            userId,
            current_stage: 1,
            total_stages,
            items_per_stage,
            current_theta: priorTheta,
            prior_theta: priorTheta,
            current_se: 999.0,
            total_items_answered: 0,
            total_correct: 0,
            routing_path: routingPath,
            stage_items: stageItemsMap,
            stage_responses: {},
            used_item_ids: stage1Assembly.item_ids,
            cut_score,
        });

        await this.mstSessionRepo.save(mstSession);

        // 6. Enrich ข้อสอบด้วย Answer Options & Sub-topics
        const enrichedStageItems = await this.enrichItemsWithDetails(stage1Assembly.items);

        return {
            message: 'เริ่มการสอบ MST สำเร็จ',
            session_id: Number(savedBase.session_id),
            current_stage: 1,
            total_stages,
            items_per_stage,
            current_theta: mstSession.current_theta,
            routing_path: routingPath,
            stage_items: enrichedStageItems,
            start_time: savedBase.start_time,
        };
    }

    /**
     * ดึงข้อมูลข้อสอบใน Stage ปัจจุบัน
     */
    async getCurrentStage(userId: number, sessionId: number) {
        const session = await this.mstSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        if (session.base_session.end_time) {
            throw new BadRequestException('Session นี้จบการสอบแล้ว');
        }

        const stageKey = String(session.current_stage);
        const itemIds = session.stage_items?.[stageKey] || [];

        if (itemIds.length === 0) {
            throw new NotFoundException('ไม่พบข้อสอบใน Stage ปัจจุบัน');
        }

        const items = await this.itemRepo.find({
            where: { item_id: In(itemIds) },
            relations: ['situation'],
        });

        // จัดเรียงตามลำดับ itemIds เดิม
        const itemMap = new Map(items.map((i) => [i.item_id, i]));
        const sortedItems = itemIds.map((id) => itemMap.get(id)).filter(Boolean) as Item[];

        const enrichedItems = await this.enrichItemsWithDetails(sortedItems);

        return {
            session_id: Number(session.session_id),
            current_stage: session.current_stage,
            total_stages: session.total_stages,
            items_per_stage: session.items_per_stage,
            current_theta: session.current_theta,
            current_se: session.current_se,
            routing_path: session.routing_path,
            stage_items: enrichedItems,
        };
    }

    /**
     * ส่งคำตอบของทั้ง Stage และประมวลผลเปลี่ยนด่าน (Stage Routing)
     */
    async submitStage(userId: number, submitDto: SubmitMSTStageDto) {
        const { session_id, stage_number, answers } = submitDto;

        const session = await this.mstSessionRepo.findOne({
            where: { session_id },
            relations: ['base_session'],
        });

        if (!session) {
            throw new NotFoundException(`ไม่พบ session ID ${session_id}`);
        }
        if (session.base_session.userId !== userId) {
            throw new UnauthorizedException(`คุณไม่มีสิทธิ์เข้าถึง session ID ${session_id}`);
        }

        if (session.base_session.end_time) {
            throw new BadRequestException('Session นี้จบการสอบแล้ว');
        }

        if (session.current_stage !== stage_number) {
            throw new BadRequestException(
                `Stage ไม่ถูกต้อง (ปัจจุบันคือ Stage ${session.current_stage})`,
            );
        }

        // 1. ตรวจคำตอบของ Stage ปัจจุบัน
        const itemIds = answers.map((a) => a.item_id);
        const items = await this.itemRepo.find({
            where: { item_id: In(itemIds) },
            relations: ['answer_options'],
        });
        const itemMap = new Map(items.map((i) => [i.item_id, i]));

        let stageCorrectCount = 0;
        const currentStageResponses = answers.map((ans) => {
            const item = itemMap.get(ans.item_id);
            const correctOpt = item?.answer_options?.find((opt) => opt.is_correct);
            const isCorrect = ans.selected_option_id === correctOpt?.option_id;

            if (isCorrect) stageCorrectCount += 1;

            return {
                item_id: ans.item_id,
                selected_option_id: ans.selected_option_id,
                is_correct: isCorrect,
                response_time_ms: ans.response_time_ms || 0,
                timestamp: new Date(),
            };
        });

        // 2. อัปเดต Stage Responses
        const allStageResponses = {
            ...(session.stage_responses || {}),
            [String(stage_number)]: currentStageResponses,
        };
        session.stage_responses = allStageResponses;
        session.total_items_answered += answers.length;
        session.total_correct += stageCorrectCount;

        // 3. รวบรวมคำตอบทั้งหมดตั้งแต่เริ่มต้นมาประเมิน IRT EAP Theta
        const allResponsesFlattened: any[] = [];
        for (const respList of Object.values(allStageResponses)) {
            if (Array.isArray(respList)) {
                allResponsesFlattened.push(...respList);
            }
        }

        const allAnsweredItemIds = allResponsesFlattened.map((r) => r.item_id);
        const historyItems = await this.itemRepo.find({
            where: { item_id: In(allAnsweredItemIds) },
        });
        const historyItemMap = new Map(historyItems.map((i) => [i.item_id, i]));

        const irtResponses: IRTResponse[] = allResponsesFlattened
            .map((r) => {
                const it = historyItemMap.get(r.item_id);
                if (
                    it &&
                    it.irt_a_discrimination != null &&
                    it.irt_b_difficulty != null &&
                    it.irt_c_guessing != null
                ) {
                    return {
                        item: {
                            a: it.irt_a_discrimination,
                            b: it.irt_b_difficulty,
                            c: it.irt_c_guessing,
                        },
                        isCorrect: r.is_correct,
                    };
                }
                return null;
            })
            .filter((r) => r !== null) as IRTResponse[];

        const estimation = this.irtService.estimateThetaEAP(
            irtResponses,
            session.prior_theta ?? 0.0,
            1.0,
        );

        session.current_theta = estimation.theta;
        session.current_se = estimation.se;

        // 4. ตรวจสอบว่าจบการสอบหรือยัง (ครบ total_stages หรือไม่)
        const isLastStage = session.current_stage >= session.total_stages;

        if (isLastStage) {
            // จบการสอบ
            const now = new Date();
            await this.sessionRepo.update(session.session_id, { end_time: now });

            session.final_theta = session.current_theta;
            session.final_se = session.current_se;
            session.passed = session.final_theta >= session.cut_score;
            session.stop_reason = `ทำครบทุกด่าน (${session.total_stages} Stages)`;
            session.end_time = now;

            await this.mstSessionRepo.save(session);

            // ส่งการแจ้งเตือน
            try {
                await this.notificationsService.create({
                    user_id: session.base_session.userId,
                    title: session.passed
                        ? 'ยินดีด้วย! คุณสอบผ่าน MST 🎉'
                        : 'สอบ MST เสร็จสิ้น 💪',
                    message: `คุณทำข้อสอบ MST ครบ ${session.total_stages} ด่าน (${session.total_items_answered} ข้อ) ค่าความสามารถ (θ) คือ ${session.current_theta.toFixed(2)}`,
                    notification_type_id: session.passed ? 2 : 1,
                    link_url: `/user/mst-exam/result/${session.session_id}`,
                });
            } catch (err) {
                console.error('Error sending MST notification:', err);
            }

            return {
                message: 'จบการสอบ MST เรียบร้อยแล้ว',
                finished: true,
                session_id: Number(session.session_id),
                final_theta: session.final_theta,
                final_se: session.final_se,
                total_items_answered: session.total_items_answered,
                total_correct: session.total_correct,
                passed: session.passed,
                routing_path: session.routing_path,
                stop_reason: session.stop_reason,
            };
        } else {
            // 5. ตัดสินใจเลือก Stage ถัดไป (Routing)
            const nextStageNum = session.current_stage + 1;
            const nextDifficulty = this.mstRoutingService.determineNextDifficulty(
                session.current_theta,
                session.current_stage,
            );

            // ดึงข้อสอบทั้งหมดเพื่อนำมาประกอบด่านถัดไป
            const availableItems = await this.getAvailableItems(
                session.base_session.itemBankId ?? undefined,
            );
            const usedSet = new Set<number>(session.used_item_ids || []);

            const nextAssembly = this.mstRoutingService.assembleStageItems(
                availableItems,
                usedSet,
                nextDifficulty,
                session.items_per_stage,
            );

            // ถ้าข้อสอบหมด ให้จบการสอบทันที
            if (nextAssembly.items.length === 0) {
                const now = new Date();
                await this.sessionRepo.update(session.session_id, { end_time: now });

                session.final_theta = session.current_theta;
                session.final_se = session.current_se;
                session.passed = session.final_theta >= session.cut_score;
                session.stop_reason = 'ข้อสอบในคลังหมดก่อนกำหนด';
                session.end_time = now;

                await this.mstSessionRepo.save(session);

                return {
                    message: 'จบการสอบ (ข้อสอบในคลังหมด)',
                    finished: true,
                    session_id: Number(session.session_id),
                    final_theta: session.final_theta,
                    final_se: session.final_se,
                    total_items_answered: session.total_items_answered,
                    total_correct: session.total_correct,
                    passed: session.passed,
                    routing_path: session.routing_path,
                    stop_reason: session.stop_reason,
                };
            }

            // อัปเดตข้อมูล Session สำหรับ Stage ถัดไป
            const stageLabel = `Stage ${nextStageNum}: Targeted (${nextDifficulty.toUpperCase()})`;
            session.routing_path = [...(session.routing_path || []), stageLabel];
            session.stage_items = {
                ...(session.stage_items || {}),
                [String(nextStageNum)]: nextAssembly.item_ids,
            };
            session.used_item_ids = [...usedSet, ...nextAssembly.item_ids];
            session.current_stage = nextStageNum;

            await this.mstSessionRepo.save(session);

            const enrichedNextItems = await this.enrichItemsWithDetails(nextAssembly.items);

            return {
                message: `เข้าสู่ Stage ${nextStageNum} (${nextDifficulty.toUpperCase()}) สำเร็จ`,
                finished: false,
                session_id: Number(session.session_id),
                current_stage: nextStageNum,
                total_stages: session.total_stages,
                current_theta: session.current_theta,
                current_se: session.current_se,
                routing_path: session.routing_path,
                stage_items: enrichedNextItems,
            };
        }
    }

    /**
     * ดึงผลการสอบ MST
     */
    async getExamResult(userId: number, sessionId: number) {
        const session = await this.mstSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session || session.base_session.userId !== userId) {
            throw new NotFoundException(`ไม่พบ session ID ${sessionId}`);
        }

        const itemBank = session.base_session.itemBankId
            ? await this.itemsBankRepo.findOne({
                where: { item_bank_id: session.base_session.itemBankId },
            })
            : null;

        // รวบรวมคำตอบและดึงรายละเอียดข้อสอบทั้งหมด
        const stageResponsesMap = session.stage_responses || {};
        const stageResults: Array<{
            stage_number: number;
            stage_label: string;
            items: any[];
        }> = [];

        for (const [stgNumStr, respList] of Object.entries(stageResponsesMap)) {
            const stgNum = parseInt(stgNumStr);
            const label = session.routing_path?.[stgNum - 1] || `Stage ${stgNum}`;

            const enrichedResponses = await Promise.all(
                (respList as any[]).map(async (resp) => {
                    const item = await this.itemRepo.findOne({
                        where: { item_id: resp.item_id },
                        relations: ['answer_options', 'situation'],
                    });

                    return {
                        ...resp,
                        question_text: item?.question_text,
                        question_image_url: item?.question_image_url,
                        explanation: item?.explanation,
                        situation: item?.situation,
                        answer_options: item?.answer_options,
                        irt_a: item?.irt_a_discrimination ?? null,
                        irt_b: item?.irt_b_difficulty ?? null,
                        irt_c: item?.irt_c_guessing ?? null,
                    };
                }),
            );

            stageResults.push({
                stage_number: stgNum,
                stage_label: label,
                items: enrichedResponses,
            });
        }

        // วิเคราะห์สถิติตาม Topic
        const allResponses = Object.values(stageResponsesMap).flat();
        const topicStats = new Map<string, {
            topic_id: number;
            topic_name: string;
            sub_topics: Map<number, { sub_topic_id: number; sub_topic_name: string; correct: number; total: number }>;
        }>();

        await Promise.all(
            allResponses.map(async (resp: any) => {
                const itemSubTopics = await this.itemSubTopicRepo.find({
                    where: { item_id: resp.item_id },
                    relations: ['sub_topic', 'sub_topic.topic'],
                });

                itemSubTopics.forEach((ist) => {
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
            }),
        );

        const topicAnalysis = Array.from(topicStats.values()).map((topic) => {
            const subTopicsArray = Array.from(topic.sub_topics.values()).map((st) => ({
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
            item_bank_name: itemBank?.bank_name || 'คลังข้อสอบรวม (Global Pool)',
            status: session.base_session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
            start_time: session.base_session.start_time,
            end_time: session.base_session.end_time,
            current_theta: session.current_theta,
            current_se: session.current_se,
            final_theta: session.final_theta,
            final_se: session.final_se,
            total_items_answered: session.total_items_answered,
            total_correct: session.total_correct,
            passed: session.passed,
            routing_path: session.routing_path,
            stop_reason: session.stop_reason,
            stages: stageResults,
            topic_analysis: topicAnalysis,
        };
    }

    /**
     * ดูประวัติการสอบ MST ของผู้ใช้
     */
    async getUserMSTHistory(userId: number) {
        const sessions = await this.mstSessionRepo.find({
            relations: ['base_session'],
            where: { base_session: { userId } },
        });

        sessions.sort(
            (a, b) =>
                b.base_session.start_time.getTime() - a.base_session.start_time.getTime(),
        );

        return Promise.all(
            sessions.map(async (session) => {
                const itemBank = session.base_session.itemBankId
                    ? await this.itemsBankRepo.findOne({
                        where: { item_bank_id: session.base_session.itemBankId },
                    })
                    : null;

                return {
                    session_id: Number(session.session_id),
                    item_bank_id: session.base_session.itemBankId,
                    item_bank_name: itemBank?.bank_name || 'คลังข้อสอบรวม',
                    status: session.base_session.end_time ? 'COMPLETED' : 'IN_PROGRESS',
                    start_time: session.base_session.start_time,
                    end_time: session.base_session.end_time,
                    final_theta: session.final_theta,
                    total_items: session.total_items_answered,
                    total_correct: session.total_correct,
                    passed: session.passed,
                    routing_path: session.routing_path,
                };
            }),
        );
    }

    /**
     * ยกเลิก session การสอบ MST (ไม่บันทึกประวัติ)
     */
    async cancelMSTSession(userId: number, sessionId: number) {
        const session = await this.mstSessionRepo.findOne({
            where: { session_id: sessionId },
            relations: ['base_session'],
        });

        if (!session) return { message: 'ไม่พบ session', cancelled: false };
        if (session.base_session.userId !== userId) return { message: 'ไม่มีสิทธิ์', cancelled: false };
        if (session.base_session.end_time) return { message: 'Session นี้จบแล้ว', cancelled: false };

        await this.mstSessionRepo.delete({ session_id: sessionId });
        await this.sessionRepo.delete({ session_id: sessionId });

        return { message: 'ยกเลิกการสอบ MST สำเร็จ', cancelled: true };
    }

    // ==================== Private Helpers ====================

    private async getAvailableItems(itemBankId?: number): Promise<Item[]> {
        const query = this.itemRepo
            .createQueryBuilder('item')
            .leftJoinAndSelect('item.item_sub_topics', 'ist')
            .leftJoinAndSelect('ist.sub_topic', 'st')
            .leftJoinAndSelect('item.situation', 'situation')
            .where('item.irt_a_discrimination > 0')
            .andWhere('item.irt_b_difficulty IS NOT NULL')
            .andWhere('item.irt_c_guessing IS NOT NULL')
            .andWhere("(item.status IS NULL OR LOWER(item.status) IN ('published', 'draft', 'active'))")
            .andWhere('item.deleted_at IS NULL');

        if (itemBankId) {
            query.innerJoin(
                ItemBankItem,
                'ibi',
                'ibi.item_id = item.item_id AND ibi.item_bank_id = :itemBankId',
                { itemBankId },
            );
        }

        return query.getMany();
    }

    private async enrichItemsWithDetails(items: Item[]) {
        const itemIds = items.map((i) => i.item_id);
        const options = await this.answerOptionRepo.find({
            where: { item_id: In(itemIds) },
            order: { option_id: 'ASC' },
        });

        const subTopics = await this.itemSubTopicRepo.find({
            where: { item_id: In(itemIds) },
            relations: ['sub_topic'],
        });

        const optionMap = new Map<number, AnswerOption[]>();
        for (const opt of options) {
            if (!optionMap.has(opt.item_id)) optionMap.set(opt.item_id, []);
            optionMap.get(opt.item_id)!.push(opt);
        }

        const subTopicMap = new Map<number, any[]>();
        for (const st of subTopics) {
            if (!subTopicMap.has(st.item_id)) subTopicMap.set(st.item_id, []);
            if (st.sub_topic) {
                subTopicMap.get(st.item_id)!.push({
                    sub_topic_id: st.sub_topic.sub_topic_id,
                    sub_topic_name: st.sub_topic.sub_topic_name,
                });
            }
        }

        return items.map((item) => ({
            ...item,
            answer_options: optionMap.get(item.item_id) || [],
            sub_topics: subTopicMap.get(item.item_id) || [],
        }));
    }

    private async getLatestAbility(userId: number) {
        const lastBaseSession = await this.sessionRepo
            .createQueryBuilder('session')
            .where('session.userId = :userId', { userId })
            .andWhere("session.session_type IN ('MST', 'CAT')")
            .andWhere('session.end_time IS NOT NULL')
            .orderBy('session.end_time', 'DESC')
            .getOne();

        if (!lastBaseSession) return { theta: 0.0, has_history: false };

        if (lastBaseSession.session_type === 'MST') {
            const mst = await this.mstSessionRepo.findOne({
                where: { session_id: lastBaseSession.session_id },
            });
            return { theta: mst?.final_theta ?? 0.0, has_history: !!mst };
        }

        return { theta: 0.0, has_history: false };
    }

    // ==================== Admin Analytics & Readiness ====================

    /**
     * [Admin] สรุปผล Analytics ของ MST ทั้งหมด
     */
    async getAdminAnalytics() {
        const sessions = await this.mstSessionRepo.find({
            relations: ['base_session', 'base_session.user'],
        });

        const completedSessions = sessions.filter((s) => s.base_session.end_time);
        const total = completedSessions.length;
        const passed = completedSessions.filter((s) => s.passed).length;
        const failed = total - passed;

        const avgTheta =
            total > 0
                ? completedSessions.reduce((sum, s) => sum + (s.final_theta ?? 0), 0) / total
                : 0;
        const avgSE =
            total > 0
                ? completedSessions.reduce((sum, s) => sum + (s.final_se ?? 0), 0) / total
                : 0;
        const avgItems =
            total > 0
                ? completedSessions.reduce((sum, s) => sum + (s.total_items_answered ?? 0), 0) / total
                : 0;

        // Routing Pathway Distribution
        const pathwayCounts: Record<string, number> = {};
        completedSessions.forEach((s) => {
            const pathKey = (s.routing_path || []).join(' ➔ ') || 'Unknown Path';
            pathwayCounts[pathKey] = (pathwayCounts[pathKey] || 0) + 1;
        });

        // Theta distribution (-3 to 3)
        const BINS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
        const thetaDist = BINS.slice(0, -1).map((lo, i) => {
            const hi = BINS[i + 1];
            const count = completedSessions.filter((s) => {
                const t = s.final_theta ?? 0;
                return t >= lo && t < hi;
            }).length;
            return { range: `${lo}~${hi}`, count };
        });

        // Recent 10 sessions
        const recent = completedSessions
            .sort(
                (a, b) =>
                    b.base_session.end_time.getTime() - a.base_session.end_time.getTime(),
            )
            .slice(0, 10)
            .map((s) => ({
                session_id: Number(s.session_id),
                user_id: s.base_session.userId,
                user_name: s.base_session.user
                    ? `${s.base_session.user.first_name || ''} ${s.base_session.user.last_name || ''}`.trim() || `User #${s.base_session.userId}`
                    : `User #${s.base_session.userId}`,
                final_theta: s.final_theta,
                final_se: s.final_se,
                total_items: s.total_items_answered,
                total_correct: s.total_correct,
                passed: s.passed,
                routing_path: s.routing_path,
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
            pathway_distribution: pathwayCounts,
            theta_distribution: thetaDist,
            recent_sessions: recent,
        };
    }

    /**
     * [Admin] ตรวจสอบความพร้อมของคลังข้อสอบสำหรับ MST
     */
    async checkMSTReadiness(itemBankId?: number) {
        const items = await this.getAvailableItems(itemBankId);

        const total = items.length;
        const situations = new Set(items.map((i) => i.situation_id).filter(Boolean)).size;

        const easyCount = items.filter((i) => (i.irt_b_difficulty ?? 0) < -0.4).length;
        const mediumCount = items.filter(
            (i) => (i.irt_b_difficulty ?? 0) >= -0.4 && (i.irt_b_difficulty ?? 0) <= 0.4,
        ).length;
        const hardCount = items.filter((i) => (i.irt_b_difficulty ?? 0) > 0.4).length;

        const isReady =
            easyCount >= 6 && mediumCount >= 6 && hardCount >= 6 && total >= 24;

        let bankName = 'คลังข้อสอบรวม (Global Pool)';
        if (itemBankId) {
            const bank = await this.itemsBankRepo.findOne({ where: { item_bank_id: itemBankId } });
            bankName = bank?.bank_name || `Bank #${itemBankId}`;
        }

        return {
            item_bank_id: itemBankId || null,
            bank_name: bankName,
            total_items: total,
            total_situations: situations,
            difficulty_breakdown: {
                easy: easyCount,
                medium: mediumCount,
                hard: hardCount,
            },
            is_ready: isReady,
            readiness_percentage: Math.min(100, Math.round((total / 24) * 100)),
            message: isReady
                ? '✅ คลังข้อสอบมีความพร้อมสมบูรณ์สำหรับการสอบ MST (มีข้อสอบครบทุกระดับความยาก)'
                : `⚠️ คลังข้อสอบยังต้องการข้อสอบเพิ่มเติม (ต้องการ Easy ≥ 6, Medium ≥ 6, Hard ≥ 6 รวม ≥ 24 ข้อ)`,
        };
    }
}
