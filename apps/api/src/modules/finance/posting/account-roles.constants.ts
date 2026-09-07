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
};
