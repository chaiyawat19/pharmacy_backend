import { Controller, Post, Get } from '@nestjs/common';
import { IrtService } from './irt.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/irt')
@Roles(2) // Admin only
export class IrtController {
    constructor(private readonly irtService: IrtService) { }

    /**
     * POST /admin/irt/calibrate
     * Trigger IRT calibration via the Python FastAPI microservice.
     * Protected: Admin role required (JWT guard applied globally).
     */
    @Post('calibrate')
    async calibrate() {
        return this.irtService.triggerCalibration();
    }

    /**
     * GET /admin/irt/health
     * Check if the IRT microservice is up.
     */
    @Get('health')
    async health() {
        return this.irtService.checkHealth();
    }
}
