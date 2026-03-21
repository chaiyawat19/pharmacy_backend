import { Controller, Get } from '@nestjs/common'
import { DashboardService } from './dashboard.service'

@Controller('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.dashboardService.getAdminDashboard()
  }

}