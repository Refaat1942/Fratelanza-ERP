import { Injectable } from '@nestjs/common';
import { AccountRoleService } from './posting/account-role.service';
import { PostingRuleService } from './posting/posting-rule.service';
import { FiscalPeriodService } from './fiscal-periods/fiscal-period.service';
import { ChartOfAccountsService } from './coa/chart-of-accounts.service';

@Injectable()
export class FinanceSetupService {
  constructor(
    private chartOfAccounts: ChartOfAccountsService,
    private accountRoles: AccountRoleService,
    private postingRules: PostingRuleService,
    private fiscalPeriods: FiscalPeriodService,
  ) {}

  async seedTenantFinanceFoundation(tenantId: string) {
    await this.chartOfAccounts.seedDefaultCoa(tenantId);
    const roleCount = await this.accountRoles.seedDefaultRoleMappings(tenantId);
    const ruleCount = await this.postingRules.seedDefaultRules(tenantId);
    const period = await this.fiscalPeriods.seedCurrentYearPeriod(tenantId);

    return {
      roleMappings: roleCount,
      postingRules: ruleCount,
      fiscalPeriod: period,
    };
  }
}
