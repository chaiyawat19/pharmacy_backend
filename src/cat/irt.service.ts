import { Injectable } from '@nestjs/common';

export interface IRTItem {
    a: number; // discrimination parameter
    b: number; // difficulty parameter
    c: number; // guessing parameter
}

export interface IRTResponse {
    item: IRTItem;
    isCorrect: boolean;
}

export interface ThetaEstimation {
    theta: number;
    se: number;
}

/**
 * IRT (Item Response Theory) Service
 * คำนวณค่าต่างๆ ตามทฤษฎี IRT แบบ 3-Parameter Logistic Model (3PL)
 */
@Injectable()
export class IRTService {
    /**
     * คำนวณความน่าจะเป็นที่จะตอบถูก (3PL Model)
     * P(θ) = c + (1 - c) / (1 + exp(-a(θ - b)))
     */
    probability(theta: number, item: IRTItem): number {
        const exponent = -item.a * (theta - item.b);
        const prob = item.c + (1 - item.c) / (1 + Math.exp(exponent));
        return Math.max(0.0001, Math.min(0.9999, prob));
    }

    /**
     * คำนวณ Fisher Information
     * I(θ) = a²(P - c)²(1 - P) / [(1 - c)²P]
     */
    information(theta: number, item: IRTItem): number {
        const P = this.probability(theta, item);

        if (P <= 0.0001 || P >= 0.9999) {
            return 0.0;
        }

        const numerator = Math.pow(item.a, 2) * Math.pow(P - item.c, 2) * (1 - P);
        const denominator = Math.pow(1 - item.c, 2) * P;

        if (denominator === 0) return 0.0;

        return numerator / denominator;
    }

    /**
     * คำนวณ Test Information (ผลรวมของ Information ทุกข้อ)
     */
    testInformation(theta: number, items: IRTItem[]): number {
        return items.reduce((sum, item) => sum + this.information(theta, item), 0);
    }

    /**
     * คำนวณ Standard Error
     * SE(θ) = 1 / √I(θ)
     */
    standardError(theta: number, items: IRTItem[]): number {
        const info = this.testInformation(theta, items);
        if (info <= 0) return 999.0;
        return 1.0 / Math.sqrt(info);
    }

    /**
     * ประมาณค่า theta ด้วยวิธี EAP (Expected A Posteriori)
     * ใช้ Bayesian approach ในการประมาณค่า
     */
    estimateThetaEAP(
        responses: IRTResponse[],
        priorMean: number = 0,
        priorSD: number = 1,
    ): ThetaEstimation {
        if (responses.length === 0) {
            return { theta: 0.0, se: 999.0 };
        }

        const numQuadrature = 49;
        const thetaMin = -4.0;
        const thetaMax = 4.0;

        // สร้าง quadrature points
        const thetaPoints: number[] = [];
        for (let i = 0; i < numQuadrature; i++) {
            thetaPoints.push(
                thetaMin + ((thetaMax - thetaMin) * i) / (numQuadrature - 1),
            );
        }

        // คำนวณ Prior (Normal distribution)
        const prior = thetaPoints.map((theta) =>
            this.normalPDF(theta, priorMean, priorSD),
        );

        // คำนวณ Likelihood
        const likelihoods = thetaPoints.map((theta) => {
            let logL = 0;
            for (const response of responses) {
                const P = this.probability(theta, response.item);
                if (response.isCorrect) {
                    logL += Math.log(P);
                } else {
                    logL += Math.log(1 - P);
                }
            }
            return Math.exp(logL);
        });

        // Posterior = Likelihood × Prior
        const posterior = likelihoods.map((L, i) => L * prior[i]);

        // Normalize
        const total = posterior.reduce((sum, p) => sum + p, 0);
        if (total === 0) {
            return { theta: priorMean, se: 999.0 };
        }

        const normalizedPosterior = posterior.map((p) => p / total);

        // EAP = Expected value
        const thetaEAP = thetaPoints.reduce(
            (sum, theta, i) => sum + theta * normalizedPosterior[i],
            0,
        );

        // Standard Error
        const variance = thetaPoints.reduce(
            (sum, theta, i) =>
                sum + Math.pow(theta - thetaEAP, 2) * normalizedPosterior[i],
            0,
        );
        const se = Math.sqrt(variance);

        return { theta: thetaEAP, se: se };
    }

    /**
     * Normal PDF helper function
     * f(x) = (1 / (σ√2π)) * exp(-(x-μ)² / 2σ²)
     */
    private normalPDF(x: number, mean: number, sd: number): number {
        const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(sd, 2));
        return Math.exp(exponent) / (sd * Math.sqrt(2 * Math.PI));
    }

    /**
     * จำลองการตอบคำถาม (สำหรับการทดสอบ/demo)
     */
    simulateResponse(item: any, trueAbility: number): {
        selectedAnswer: number;
        isCorrect: boolean;
    } {
        const irtItem: IRTItem = {
            a: item.irt_a_discrimination,
            b: item.irt_b_difficulty,
            c: item.irt_c_guessing,
        };

        const prob = this.probability(trueAbility, irtItem);
        const isCorrect = Math.random() < prob;

        if (isCorrect) {
            // หาคำตอบที่ถูกต้อง
            const correctOption = item.answer_options?.find(
                (opt: any) => opt.is_correct,
            );
            return {
                selectedAnswer: correctOption?.option_id || 0,
                isCorrect: true,
            };
        } else {
            // เลือกคำตอบผิดแบบสุ่ม
            const wrongOptions = item.answer_options?.filter(
                (opt: any) => !opt.is_correct,
            );
            if (wrongOptions && wrongOptions.length > 0) {
                const randomWrong =
                    wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
                return { selectedAnswer: randomWrong.option_id, isCorrect: false };
            }
            return { selectedAnswer: 0, isCorrect: false };
        }
    }
}
