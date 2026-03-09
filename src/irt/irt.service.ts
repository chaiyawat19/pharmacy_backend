import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IrtService {
    private readonly logger = new Logger(IrtService.name);
    private readonly irtServiceUrl: string;
    private readonly irtSecret: string;

    constructor(private readonly configService: ConfigService) {
        this.irtServiceUrl = this.configService.get<string>('IRT_SERVICE_URL') ?? 'http://localhost:8000';
        this.irtSecret = this.configService.get<string>('IRT_SERVICE_SECRET') ?? 'change-me-in-production';
    }

    async triggerCalibration(): Promise<Record<string, unknown>> {
        this.logger.log(`Calling IRT service: POST ${this.irtServiceUrl}/calibrate`);

        try {
            const response = await axios.post(
                `${this.irtServiceUrl}/calibrate`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${this.irtSecret}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 300_000, // 5 min — calibration can take a while
                },
            );
            this.logger.log(`IRT calibration done: ${JSON.stringify(response.data)}`);
            return response.data as Record<string, unknown>;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const msg = (error.response?.data as { detail?: string })?.detail ?? error.message;
                this.logger.error(`IRT service error: ${msg}`);
                throw new HttpException(
                    { message: 'IRT calibration failed', detail: msg },
                    error.response?.status ?? HttpStatus.BAD_GATEWAY,
                );
            }
            throw new HttpException('IRT calibration failed', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async checkHealth(): Promise<Record<string, unknown>> {
        try {
            const response = await axios.get(`${this.irtServiceUrl}/health`, { timeout: 5000 });
            return response.data as Record<string, unknown>;
        } catch {
            throw new HttpException('IRT service is unavailable', HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}
