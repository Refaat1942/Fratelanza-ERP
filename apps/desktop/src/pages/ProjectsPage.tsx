import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, PageToolbar, StatusBadge, useApiClient } from '../components/DataTable';
import type { ProjectRow } from '../lib/api';

export function ProjectsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createProject({
        name,
        description: description || undefined,
      });
      setOpen(false);
      setName('');
      setDescription('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.projects')}
        breadcrumbs={[{ label: t('nav.projects') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('projects.create')}
          </button>
        }
      />
      <PageToolbar>
        <input
          className="input"
          placeholder={t('projects.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageToolbar>
      {error && <p className="form-error">{error}</p>}
      <DataTable<ProjectRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('projects.code') },
          { key: 'name', label: t('projects.name') },
          { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
        ]}
        fetchData={(c) => c.getProjects(search || undefined)}
      />
      <Modal open={open} title={t('projects.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleCreate(e)}>
          <FormField label={t('projects.name')}>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label={t('projects.description')}>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
