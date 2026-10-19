import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveyParticipant } from './entities/survey-participant.entity';
import { SurveySettings } from './entities/survey-settings.entity';
import {
  DEMOGRAPHIC_QUESTIONS,
  LIKERT_GROUPS,
  LIKERT_SCALE,
  RANKING_GROUPS,
  SUGGESTION,
  SURVEY_DEFINITION,
  SURVEY_VERSION,
  interpretMean,
} from './survey.definition';

/** คำตอบหลังตรวจแล้ว — รูปแบบที่เก็บลงคอลัมน์ answers */
type NormalizedAnswers = {
  demographics: Record<string, string | string[]>;
  likert: Record<string, number>;
  ranking: Record<string, Record<string, number>>;
  suggestion?: string;
};

const ALL_LIKERT_ITEMS = LIKERT_GROUPS.flatMap((g) => g.items);

const round = (n: number, digits = 2) => Number(n.toFixed(digits));

/** ค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐานแบบกลุ่มตัวอย่าง (หารด้วย n − 1) */
function meanSd(values: number[]) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, sd: null, level: null };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
      : 0;
  return { n, mean: round(mean), sd: round(sd), level: interpretMean(mean) };
}

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
    @InjectRepository(SurveyParticipant)
    private readonly participantRepo: Repository<SurveyParticipant>,
    @InjectRepository(SurveySettings)
    private readonly settingsRepo: Repository<SurveySettings>,
    private readonly dataSource: DataSource,
  ) {}

  // ── ตั้งค่า ────────────────────────────────────────────────────────────────

  async getSettings(): Promise<SurveySettings> {
    let settings = await this.settingsRepo.findOne({
      where: {},
      order: { id: 'ASC' },
    });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ isOpen: true }),
      );
    }
    return settings;
  }

  async updateSettings(userId: number, isOpen: boolean) {
    const settings = await this.getSettings();
    settings.isOpen = isOpen;
    settings.updatedBy = userId;
    await this.settingsRepo.save(settings);
    return { isOpen: settings.isOpen, updatedAt: settings.updatedAt };
  }

  // ── ฝั่งผู้ตอบ ──────────────────────────────────────────────────────────────

  /** สถานะสั้น ๆ สำหรับเมนูผู้ใช้ — เปิดแบบประเมินอยู่ไหม (ปิด = ซ่อนเมนู) และตอบไปแล้วหรือยัง */
  async getStatus(userId: number) {
    const [settings, participant] = await Promise.all([
      this.getSettings(),
      this.participantRepo.findOne({ where: { userId } }),
    ]);
    return { isOpen: settings.isOpen, hasResponded: !!participant };
  }

  async getForUser(userId: number) {
    return { ...(await this.getStatus(userId)), definition: SURVEY_DEFINITION };
  }

  async submit(userId: number, rawAnswers: Record<string, unknown>) {
    const settings = await this.getSettings();
    if (!settings.isOpen) {
      throw new ForbiddenException('ขณะนี้ปิดรับคำตอบแบบประเมินแล้ว');
    }

    const answers = this.validateAnswers(rawAnswers);

    // บันทึกผู้ตอบกับคำตอบพร้อมกัน — ถ้าเคยตอบแล้ว (ชน primary key) จะไม่มีอะไรถูกบันทึกเลย
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(SurveyParticipant, { userId });
        await manager.insert(SurveyResponse, {
          version: SURVEY_VERSION,
          answers,
        });
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('ท่านได้ส่งแบบประเมินไปแล้ว');
      }
      throw err;
    }
    return { success: true };
  }

  /** ตรวจคำตอบเทียบกับ survey.definition.ts แล้วคืนเฉพาะค่าที่ถูกต้อง */
  private validateAnswers(raw: Record<string, unknown>): NormalizedAnswers {
    const fail = (msg: string): never => {
      throw new BadRequestException(msg);
    };
    const asObject = (v: unknown): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};

    if (raw.consent !== true)
      fail('ต้องยินยอมเข้าร่วมการวิจัยก่อนส่งแบบประเมิน');

    // ส่วนที่ 1
    const rawDemo = asObject(raw.demographics);
    const demographics: Record<string, string | string[]> = {};
    for (const q of DEMOGRAPHIC_QUESTIONS) {
      if (q.showIf && rawDemo[q.showIf.questionId] !== q.showIf.value) continue;
      const value = rawDemo[q.id];
      const allowed = q.options.map((o) => o.value);

      if (q.type === 'multi') {
        const list = Array.isArray(value) ? value : [];
        if (list.some((v) => typeof v !== 'string' || !allowed.includes(v)))
          fail(`คำตอบข้อ "${q.label}" ไม่ถูกต้อง`);
        if (q.required && list.length === 0) fail(`กรุณาตอบข้อ "${q.label}"`);
        if (list.length > 0)
          demographics[q.id] = [...new Set(list as string[])];
        continue;
      }

      if (value === undefined || value === null || value === '') {
        if (q.required) fail(`กรุณาตอบข้อ "${q.label}"`);
        continue;
      }
      if (typeof value !== 'string' || !allowed.includes(value))
        fail(`คำตอบข้อ "${q.label}" ไม่ถูกต้อง`);
      demographics[q.id] = value as string;

      if (q.otherValue && value === q.otherValue) {
        const other =
          typeof rawDemo[`${q.id}Other`] === 'string'
            ? (rawDemo[`${q.id}Other`] as string).trim()
            : '';
        if (!other) fail(`กรุณาระบุรายละเอียดข้อ "${q.label}"`);
        demographics[`${q.id}Other`] = other.slice(0, 100);
      }
    }

    // ส่วนที่ 2 — ข้ามได้ตามเอกสารชี้แจง แต่ถ้าตอบต้องเป็น 1–5
    const rawLikert = asObject(raw.likert);
    const likert: Record<string, number> = {};
    for (const item of ALL_LIKERT_ITEMS) {
      const v = rawLikert[item.id];
      if (v === undefined || v === null) continue;
      if (
        !Number.isInteger(v) ||
        (v as number) < LIKERT_SCALE.min ||
        (v as number) > LIKERT_SCALE.max
      ) {
        fail(
          `คำตอบข้อ ${item.id} ต้องเป็นตัวเลข ${LIKERT_SCALE.min}–${LIKERT_SCALE.max}`,
        );
      }
      likert[item.id] = v as number;
    }

    // ส่วนที่ 3 — ข้ามทั้งกลุ่มได้ แต่ถ้าตอบ ตัวเลขต้องไม่ซ้ำกันในกลุ่ม
    const rawRanking = asObject(raw.ranking);
    const ranking: Record<string, Record<string, number>> = {};
    for (const group of RANKING_GROUPS) {
      const rawGroup = asObject(rawRanking[group.id]);
      const ranks: Record<string, number> = {};
      for (const item of group.items) {
        const v = rawGroup[item.id];
        if (v === undefined || v === null) continue;
        if (
          !Number.isInteger(v) ||
          (v as number) < 1 ||
          (v as number) > group.items.length
        ) {
          fail(
            `ลำดับใน "${group.title}" ต้องเป็นตัวเลข 1–${group.items.length}`,
          );
        }
        ranks[item.id] = v as number;
      }
      const used = Object.values(ranks);
      if (new Set(used).size !== used.length)
        fail(`ลำดับใน "${group.title}" ห้ามใช้ตัวเลขซ้ำกัน`);
      if (used.length > 0) ranking[group.id] = ranks;
    }

    // ส่วนที่ 4
    const suggestion =
      typeof raw.suggestion === 'string'
        ? raw.suggestion.trim().slice(0, SUGGESTION.maxLength)
        : '';

    return {
      demographics,
      likert,
      ranking,
      ...(suggestion ? { suggestion } : {}),
    };
  }

  // ── ฝั่งแอดมิน ─────────────────────────────────────────────────────────────

  private async loadAnswers() {
    const rows = await this.responseRepo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => ({ ...r, answers: r.answers as NormalizedAnswers }));
  }

  /** สรุปผลสำหรับแดชบอร์ด: จำนวนผู้ตอบ ข้อมูลทั่วไป ค่าเฉลี่ย/S.D. รายข้อและรายด้าน ลำดับความชอบ ข้อเสนอแนะ */
  async getSummary() {
    const [settings, rows] = await Promise.all([
      this.getSettings(),
      this.loadAnswers(),
    ]);
    const total = rows.length;

    const demographics = DEMOGRAPHIC_QUESTIONS.map((q) => {
      const counts: Record<string, number> = Object.fromEntries(
        q.options.map((o) => [o.value, 0]),
      );
      let answered = 0;
      const others: string[] = [];
      for (const r of rows) {
        const v = r.answers.demographics?.[q.id];
        if (v === undefined) continue;
        answered++;
        for (const one of Array.isArray(v) ? v : [v])
          counts[one] = (counts[one] ?? 0) + 1;
        const other = r.answers.demographics?.[`${q.id}Other`];
        if (typeof other === 'string') others.push(other);
      }
      return {
        id: q.id,
        label: q.label,
        type: q.type,
        answered,
        options: q.options.map((o) => ({
          value: o.value,
          label: o.label,
          count: counts[o.value] ?? 0,
          percent: answered
            ? round(((counts[o.value] ?? 0) / answered) * 100, 1)
            : 0,
        })),
        others,
      };
    });

    const allLikertValues: number[] = [];
    const likertGroups = LIKERT_GROUPS.map((g) => {
      const groupValues: number[] = [];
      const items = g.items.map((item) => {
        const values = rows
          .map((r) => r.answers.likert?.[item.id])
          .filter((v): v is number => typeof v === 'number');
        groupValues.push(...values);
        const distribution = [1, 2, 3, 4, 5].map(
          (score) => values.filter((v) => v === score).length,
        );
        return {
          id: item.id,
          text: item.text,
          ...meanSd(values),
          distribution,
        };
      });
      allLikertValues.push(...groupValues);
      return { id: g.id, title: g.title, ...meanSd(groupValues), items };
    });

    const ranking = RANKING_GROUPS.map((g) => ({
      id: g.id,
      title: g.title,
      items: g.items
        .map((item) => {
          const ranks = rows
            .map((r) => r.answers.ranking?.[g.id]?.[item.id])
            .filter((v): v is number => typeof v === 'number');
          return {
            id: item.id,
            label: item.label,
            n: ranks.length,
            averageRank: ranks.length
              ? round(ranks.reduce((s, v) => s + v, 0) / ranks.length)
              : null,
            firstChoice: ranks.filter((v) => v === 1).length,
          };
        })
        // ลำดับเฉลี่ยน้อย = ชอบมาก
        .sort(
          (a, b) => (a.averageRank ?? Infinity) - (b.averageRank ?? Infinity),
        ),
    }));

    const suggestions = rows
      .filter((r) => r.answers.suggestion)
      .map((r) => ({
        text: r.answers.suggestion as string,
        createdAt: r.createdAt,
      }))
      .reverse();

    return {
      isOpen: settings.isOpen,
      totalResponses: total,
      lastResponseAt: total ? rows[total - 1].createdAt : null,
      overall: meanSd(allLikertValues),
      demographics,
      likertGroups,
      ranking,
      suggestions,
    };
  }

  /** คำตอบรายคน (ไม่ระบุตัวตน) สำหรับส่งออกไปวิเคราะห์ต่อ เช่น Excel / SPSS */
  async getResponsesForExport() {
    const rows = await this.loadAnswers();
    const label = (qId: string, value: string) =>
      DEMOGRAPHIC_QUESTIONS.find((q) => q.id === qId)?.options.find(
        (o) => o.value === value,
      )?.label ?? value;

    const columns = [
      'ลำดับ',
      'วันที่ตอบ',
      ...DEMOGRAPHIC_QUESTIONS.map((q) => q.label),
      ...ALL_LIKERT_ITEMS.map((i) => i.id),
      ...RANKING_GROUPS.flatMap((g) =>
        g.items.map((i) => `${g.title.split(' ')[0]} ${i.label}`),
      ),
      'ข้อเสนอแนะ',
    ];

    const data = rows.map((r, idx) => {
      const d = r.answers.demographics ?? {};
      return [
        idx + 1,
        r.createdAt.toISOString(),
        ...DEMOGRAPHIC_QUESTIONS.map((q) => {
          const v = d[q.id];
          if (v === undefined) return '';
          if (Array.isArray(v)) return v.map((x) => label(q.id, x)).join(', ');
          const other = d[`${q.id}Other`];
          return q.otherValue && v === q.otherValue && typeof other === 'string'
            ? `อื่น ๆ: ${other}`
            : label(q.id, v);
        }),
        ...ALL_LIKERT_ITEMS.map((i) => r.answers.likert?.[i.id] ?? ''),
        ...RANKING_GROUPS.flatMap((g) =>
          g.items.map((i) => r.answers.ranking?.[g.id]?.[i.id] ?? ''),
        ),
        r.answers.suggestion ?? '',
      ];
    });

    return { columns, rows: data };
  }
}
