import { Module } from '@nestjs/common';
import { ChartOfAccountsService } from './coa/chart-of-accounts.service';
import { FiscalPeriodController } from './fiscal-periods/fiscal-period.controller';
import { FiscalPeriodService } from './fiscal-periods/fiscal-period.service';
import { FinanceController } from './finance.controller';
import { FinanceSetupService } from './finance-setup.service';
import { AccountRoleService } from './posting/account-role.service';
import { PostingDimensionService } from './posting/posting-dimension.service';
import { FinancialPostingService } from './posting/financial-posting.service';
import { PostingRuleService } from './posting/posting-rule.service';

@Module({
  controllers: [FinanceController, FiscalPeriodController],
  providers: [
    ChartOfAccountsService,
    FiscalPeriodService,
    FinanceSetupService,
    AccountRoleService,
    PostingRuleService,
    FinancialPostingService,
    PostingDimensionService,
  ],
  exports: [
    ChartOfAccountsService,
    FiscalPeriodService,
    FinanceSetupService,
    AccountRoleService,
    PostingRuleService,
    FinancialPostingService,
    PostingDimensionService,
  ],
})
export class FinanceModule {}
