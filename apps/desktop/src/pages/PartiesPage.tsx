import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, FormField, Modal, PageHeader, useApiClient } from '../components/DataTable';

interface PartyRow {
  id: string;
  code: string;
  displayName: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  roles?: Array<{ role: string }>;
}

export function PartiesPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    type: 'organization',
    displayName: '',
    legalName: '',
    email: '',
    phone: '',
  });
  const [editForm, setEditForm] = useState({
    id: '',
    displayName: '',
    email: '',
    phone: '',
    linkedCustomer: '',
    linkedSupplier: '',
    customerLinkId: '',
    supplierLinkId: '',
  });

  async function openEdit(row: PartyRow) {
    const detail = await client.getParty(row.id);
    setEditForm({
      id: row.id,
      displayName: row.displayName,
      email: row.email ?? '',
      phone: row.phone ?? '',
      linkedCustomer: detail.customer
        ? `${detail.customer.code} — ${detail.customer.name}`
        : '',
      linkedSupplier: detail.supplier
        ? `${detail.supplier.code} — ${detail.supplier.name}`
        : '',
      customerLinkId: '',
      supplierLinkId: '',
    });
    setEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.createParty({
        type: form.type as 'individual' | 'organization',
        displayName: form.displayName,
        legalName: form.legalName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      setOpen(false);
      setForm({ type: 'organization', displayName: '', legalName: '', email: '', phone: '' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await client.updateParty(editForm.id, {
        displayName: editForm.displayName,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
      });
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleAssignRole(partyId: string, role: 'customer' | 'supplier') {
    try {
      await client.assignPartyRole(partyId, role);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleArchive(partyId: string) {
    try {
      await client.archiveParty(partyId);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.parties')}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('parties.create')}
          </button>
        }
      />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="toolbar">
        <input
          className="input"
          placeholder={t('parties.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DataTable<PartyRow>
        refreshKey={refreshKey}
        columns={[
          { key: 'code', label: t('parties.code') },
          { key: 'displayName', label: t('parties.displayName') },
          { key: 'type', label: t('parties.type') },
          {
            key: 'roles',
            label: t('parties.roles'),
            render: (row) => row.roles?.map((role) => role.role).join(', ') ?? '',
          },
          {
            key: 'actions',
            label: t('common.actions'),
            render: (row) => (
              <div className="table-actions">
                <button type="button" className="btn-link" onClick={() => openEdit(row)}>
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => handleAssignRole(row.id, 'customer')}
                >
                  {t('parties.addCustomerRole')}
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => handleAssignRole(row.id, 'supplier')}
                >
                  {t('parties.addSupplierRole')}
                </button>
                <button type="button" className="btn-link" onClick={() => handleArchive(row.id)}>
                  {t('parties.archive')}
                </button>
              </div>
            ),
          },
        ]}
        fetchData={(client) => client.listParties(search || undefined)}
      />

      <Modal open={open} title={t('parties.create')} onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit}>
          <FormField label={t('parties.type')}>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="organization">{t('parties.organization')}</option>
              <option value="individual">{t('parties.individual')}</option>
            </select>
          </FormField>
          <FormField label={t('parties.displayName')}>
            <input
              className="input"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </FormField>
          <FormField label={t('parties.legalName')}>
            <input
              className="input"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            />
          </FormField>
          <FormField label={t('parties.email')}>
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField label={t('parties.phone')}>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          <button type="submit" className="btn btn-primary">
            {t('common.save')}
          </button>
        </form>
      </Modal>

      <Modal open={editOpen} title={t('parties.edit')} onClose={() => setEditOpen(false)}>
        <form onSubmit={handleEdit}>
          <FormField label={t('parties.displayName')}>
            <input
              className="input"
              required
              value={editForm.displayName}
              onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
            />
          </FormField>
          <FormField label={t('parties.email')}>
            <input
              className="input"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </FormField>
          <FormField label={t('parties.phone')}>
            <input
              className="input"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </FormField>
          <hr />
          <FormField label={t('parties.linkedCustomer')}>
            <input className="input" readOnly value={editForm.linkedCustomer || t('parties.notLinked')} />
          </FormField>
          <FormField label={t('parties.customerId')}>
            <input
              className="input"
              value={editForm.customerLinkId}
              onChange={(e) => setEditForm({ ...editForm, customerLinkId: e.target.value })}
            />
          </FormField>
          <div className="table-actions">
            <button
              type="button"
              className="btn-link"
              onClick={async () => {
                if (!editForm.customerLinkId) return;
                await client.linkLegacyCustomer(editForm.id, editForm.customerLinkId);
                await openEdit({ id: editForm.id, code: '', displayName: editForm.displayName, type: 'organization' });
                setRefreshKey((k) => k + 1);
              }}
            >
              {t('parties.linkCustomer')}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={async () => {
                await client.unlinkLegacyCustomer(editForm.id);
                await openEdit({ id: editForm.id, code: '', displayName: editForm.displayName, type: 'organization' });
                setRefreshKey((k) => k + 1);
              }}
            >
              {t('parties.unlinkCustomer')}
            </button>
          </div>
          <FormField label={t('parties.linkedSupplier')}>
            <input className="input" readOnly value={editForm.linkedSupplier || t('parties.notLinked')} />
          </FormField>
          <FormField label={t('parties.supplierId')}>
            <input
              className="input"
              value={editForm.supplierLinkId}
              onChange={(e) => setEditForm({ ...editForm, supplierLinkId: e.target.value })}
            />
          </FormField>
          <div className="table-actions">
            <button
              type="button"
              className="btn-link"
              onClick={async () => {
                if (!editForm.supplierLinkId) return;
                await client.linkLegacySupplier(editForm.id, editForm.supplierLinkId);
                await openEdit({ id: editForm.id, code: '', displayName: editForm.displayName, type: 'organization' });
                setRefreshKey((k) => k + 1);
              }}
            >
              {t('parties.linkSupplier')}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={async () => {
                await client.unlinkLegacySupplier(editForm.id);
                await openEdit({ id: editForm.id, code: '', displayName: editForm.displayName, type: 'organization' });
                setRefreshKey((k) => k + 1);
              }}
            >
              {t('parties.unlinkSupplier')}
            </button>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('common.save')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
