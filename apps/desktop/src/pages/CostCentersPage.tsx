import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { CostCenterRow } from '../lib/api';

export function CostCentersPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createCostCenter({ code, name });
      setOpen(false);
      setCode('');
      setName('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.costCenters')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('costCenters.create')}
          </button>
        }
      />
      <div className="toolbar">
        <input
          className="input"
          placeholder={t('costCenters.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      <DataTable<CostCenterRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('costCenters.code') },
          { key: 'name', label: t('costCenters.name') },
          {
            key: 'parent',
            label: t('costCenters.parent'),
            render: (r) => r.parent?.name ?? '—',
          },
          {
            key: 'project',
            label: t('projects.name'),
            render: (r) => r.project?.name ?? '—',
          },
        ]}
        fetchData={(c) => c.getCostCenters(search || undefined)}
      />
      <Modal open={open} title={t('costCenters.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('costCenters.code')}>
            <input className="form-input" value={code} onChange={(e) => setCode(e.target.value)} required />
          </FormField>
          <FormField label={t('costCenters.name')}>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
