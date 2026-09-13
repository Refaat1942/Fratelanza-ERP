import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog, DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';
import type { BranchRow } from '../lib/api';

export function BranchesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', name: '', address: '' });

  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [deleteTarget, setDeleteTarget] = useState<BranchRow | null>(null);
  const [deleteError, setDeleteError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createBranch({
        code: form.code,
        name: form.name,
        address: form.address || undefined,
      });
      setOpen(false);
      setForm({ code: '', name: '', address: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  function openEdit(row: BranchRow) {
    setError('');
    setEditing(row);
    setEditForm({
      name: row.name,
      address: row.address ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    try {
      await client.updateBranch(editing.id, {
        name: editForm.name,
        address: editForm.address || undefined,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
      });
      setEditing(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await client.deleteBranch(deleteTarget.id);
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setDeleteError(message.includes('active warehouses or users') ? t('branches.deleteBlocked') : (message || t('errors.generic')));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('branches.title')}
        breadcrumbs={[{ label: t('nav.branches') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('branches.create')}
          </button>
        }
      />
      <DataTable<BranchRow>
        refreshKey={refreshKey}
        exportFilename="branches"
        columns={[
          { key: 'code', label: t('branches.code') },
          { key: 'name', label: t('branches.name') },
          { key: 'address', label: t('warehouses.address'), render: (r) => r.address ?? '—', exportValue: (r) => r.address ?? '' },
          {
            key: 'isActive',
            label: t('common.status'),
            render: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
            exportValue: (r) => (r.isActive ? t('common.active') : t('common.inactive')),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (r) => (
              <div className="row-actions">
                <button type="button" className="btn-link" onClick={() => openEdit(r)}>{t('common.edit')}</button>
                <button type="button" className="btn-link btn-link--danger" onClick={() => { setDeleteError(''); setDeleteTarget(r); }}>
                  {t('common.delete')}
                </button>
              </div>
            ),
          },
        ]}
        fetchData={(c) => c.getBranches() as Promise<BranchRow[]>}
      />
      <Modal open={open} title={t('branches.create')} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <FormField label={t('branches.code')}>
            <input
              className="form-input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('branches.name')}>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('warehouses.address')}>
            <input
              className="form-input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>

      <Modal open={!!editing} title={t('branches.edit')} onClose={() => setEditing(null)}>
        <form onSubmit={(e) => void handleSaveEdit(e)}>
          <FormField label={t('branches.name')}>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('warehouses.address')}>
            <input className="form-input" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
          </FormField>
          <FormField label={t('branches.phone')}>
            <input className="form-input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </FormField>
          <FormField label={t('branches.email')}>
            <input className="form-input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </FormField>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        message={deleteError || t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
