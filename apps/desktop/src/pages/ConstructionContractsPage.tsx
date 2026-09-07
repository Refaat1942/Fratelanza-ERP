import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { ConstructionContractRow } from '../lib/api';

export function ConstructionContractsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [parties, setParties] = useState<Array<{ id: string; code: string; displayName: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [title, setTitle] = useState('');
  const [direction, setDirection] = useState<'customer' | 'subcontractor'>('customer');

  useEffect(() => {
    void Promise.all([client.getProjects(), client.listParties()]).then(([proj, party]) => {
      setProjects(proj);
      setParties(party);
    }).catch(() => undefined);
  }, [client]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createConstructionContract({
        projectId,
        partyId,
        title,
        direction,
        pricingModel: 'lump_sum',
      });
      setOpen(false);
      setTitle('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.constructionContracts')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('construction.createContract')}
          </button>
        }
      />
      {error && <p className="form-error">{error}</p>}
      <DataTable<ConstructionContractRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'number', label: t('construction.contractNumber') },
          { key: 'title', label: t('construction.contractTitle') },
          { key: 'direction', label: t('construction.direction') },
          { key: 'status', label: t('common.status') },
          {
            key: 'id',
            label: t('construction.boq'),
            render: (row) => (
              <Link to={`/construction/boq/${row.id}`}>{t('construction.manageBoq')}</Link>
            ),
          },
        ]}
        fetchData={(c) => c.getConstructionContracts()}
      />
      <Modal open={open} title={t('construction.createContract')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('nav.projects')}>
            <select
              className="form-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              <option value="">{t('common.select')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('nav.parties')}>
            <select
              className="form-input"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              required
            >
              <option value="">{t('common.select')}</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.displayName}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('construction.contractTitle')}>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label={t('construction.direction')}>
            <select
              className="form-input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'customer' | 'subcontractor')}
            >
              <option value="customer">{t('construction.customer')}</option>
              <option value="subcontractor">{t('construction.subcontractor')}</option>
            </select>
          </FormField>
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
