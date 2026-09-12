import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useApiClient } from '../components/DataTable';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; sourceModule: string; sourceType: string }>>([]);
  const [pending, setPending] = useState<Array<{ id: string; sourceModule: string; sourceType: string; sourceId: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workflowRows, pendingRows] = await Promise.all([
        client.getApprovalWorkflows(),
        client.getPendingApprovals(),
      ]);
      setWorkflows(workflowRows);
      setPending(pendingRows);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title={t('nav.approvals')} subtitle={t('modules.approvals.description')} />
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <h2 className="module-card-title">{t('approvals.pending')}</h2>
          <div className="table-wrap" style={{ marginBottom: '2rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('approvals.module')}</th>
                  <th>{t('approvals.document')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sourceModule}</td>
                    <td>{`${row.sourceType} · ${row.sourceId.slice(0, 8)}`}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="module-card-title">{t('approvals.workflows')}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('customers.name')}</th>
                  <th>{t('approvals.module')}</th>
                  <th>{t('approvals.document')}</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.sourceModule}</td>
                    <td>{row.sourceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
