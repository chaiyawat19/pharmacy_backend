import { Controller, Get } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(2)
  @Get('dashboard')
  async getDashboard() {
    return this.dashboardService.getAdminDashboard()
  }

}