import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('compare')
  compare(
    @Query('amountNgn') amountNgn = '20000',
    @Query('dailyNgn') dailyNgn?: string,
    @Query('months') months?: string,
  ) {
    if (dailyNgn) {
      return this.history.compareDaily({
        dailyNgn: Number(dailyNgn),
        months: Number(months ?? 12),
      });
    }
    return this.history.compareLumpSum({ amountNgn: Number(amountNgn) });
  }
}
