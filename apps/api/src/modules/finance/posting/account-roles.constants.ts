/**
 * Semantic account roles — resolved per tenant via AccountRoleMapping.
 * Avoid hardcoded COA codes in posting logic.
 */
export const ACCOUNT_ROLES = {
  CASH: 'cash',
  ACCOUNTS_RECEIVABLE: 'accounts_receivable',
  ACCOUNTS_PAYABLE: 'accounts_payable',
  INVENTORY: 'inventory',
  REVENUE: 'revenue',
  COST_OF_GOODS_SOLD: 'cost_of_goods_sold',
  OPERATING_EXPENSE: 'operating_expense',
  OWNER_EQUITY: 'owner_equity',
  TAX_PAYABLE: 'tax_payable',
  FIXED_ASSETS: 'fixed_assets',
  ACCUMULATED_DEPRECIATION: 'accumulated_depreciation',
  DEPRECIATION_EXPENSE: 'depreciation_expense',
  ASSET_DISPOSAL_GAIN_LOSS: 'asset_disposal_gain_loss',
  SALARY_EXPENSE: 'salary_expense',
  SALARY_PAYABLE: 'salary_payable',
  BANK: 'bank',
  FX_GAIN: 'fx_gain',
  FX_LOSS: 'fx_loss',
} as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES];

export const DEFAULT_ROLE_TO_COA: Record<AccountRole, { code: string; type: string; normalBalance: 'debit' | 'credit' }> = {
  [ACCOUNT_ROLES.CASH]: { code: '1000', type: 'asset', normalBalance: 'debit' },
  [ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE]: { code: '1100', type: 'asset', normalBalance: 'debit' },
  [ACCOUNT_ROLES.INVENTORY]: { code: '1200', type: 'asset', normalBalance: 'debit' },
  [ACCOUNT_ROLES.ACCOUNTS_PAYABLE]: { code: '2000', type: 'liability', normalBalance: 'credit' },
  [ACCOUNT_ROLES.OWNER_EQUITY]: { code: '3000', type: 'equity', normalBalance: 'credit' },
  [ACCOUNT_ROLES.REVENUE]: { code: '4000', type: 'revenue', normalBalance: 'credit' },
  [ACCOUNT_ROLES.COST_OF_GOODS_SOLD]: { code: '5000', type: 'expense', normalBalance: 'debit' },
  [ACCOUNT_ROLES.OPERATING_EXPENSE]: { code: '5100', type: 'expense', normalBalance: 'debit' },
  [ACCOUNT_ROLES.TAX_PAYABLE]: { code: '2100', type: 'liability', normalBalance: 'credit' },
  [ACCOUNT_ROLES.FIXED_ASSETS]: { code: '1500', type: 'asset', normalBalance: 'debit' },
  [ACCOUNT_ROLES.ACCUMULATED_DEPRECIATION]: { code: '1510', type: 'asset', normalBalance: 'credit' },
  [ACCOUNT_ROLES.DEPRECIATION_EXPENSE]: { code: '5200', type: 'expense', normalBalance: 'debit' },
  [ACCOUNT_ROLES.ASSET_DISPOSAL_GAIN_LOSS]: { code: '5210', type: 'expense', normalBalance: 'debit' },
  [ACCOUNT_ROLES.SALARY_EXPENSE]: { code: '5300', type: 'expense', normalBalance: 'debit' },
  [ACCOUNT_ROLES.SALARY_PAYABLE]: { code: '2200', type: 'liability', normalBalance: 'credit' },
  [ACCOUNT_ROLES.BANK]: { code: '1010', type: 'asset', normalBalance: 'debit' },
  [ACCOUNT_ROLES.FX_GAIN]: { code: '4900', type: 'revenue', normalBalance: 'credit' },
  [ACCOUNT_ROLES.FX_LOSS]: { code: '5900', type: 'expense', normalBalance: 'debit' },
};
