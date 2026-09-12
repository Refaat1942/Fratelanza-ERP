import { useTranslation } from 'react-i18next';
import { DataTable, PageHeader, StatusBadge } from '../components/DataTable';
import type { ApprovalRequestRow, ApprovalWorkflowRow } from '../lib/api';

export function ApprovalsPage() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t('nav.approvals')} subtitle={t('modules.approvals.description')} />
      <h2 className="module-card-title">{t('approvals.pending')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<ApprovalRequestRow>
          exportFilename="pending-approvals"
          fetchData={(c) => c.getPendingApprovals()}
          columns={[
            { key: 'sourceModule', label: t('approvals.module') },
            {
              key: 'sourceType',
              label: t('approvals.document'),
              render: (row) => `${row.sourceType} · ${row.sourceId.slice(0, 8)}`,
              exportValue: (row) => `${row.sourceType} · ${row.sourceId}`,
            },
            { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </div>
      <h2 className="module-card-title">{t('approvals.workflows')}</h2>
      <DataTable<ApprovalWorkflowRow>
        exportFilename="approval-workflows"
        fetchData={(c) => c.getApprovalWorkflows()}
        columns={[
          { key: 'name', label: t('customers.name') },
          { key: 'sourceModule', label: t('approvals.module') },
          { key: 'sourceType', label: t('approvals.document') },
        ]}
      />
    </div>
  );
}
