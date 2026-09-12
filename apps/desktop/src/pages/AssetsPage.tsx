import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable, FormActions, FormField, Modal, PageHeader, StatusBadge, useApiClient,
} from '../components/DataTable';
import { LineChart } from '../components/ui/Charts';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { AssetRow } from '../lib/api';

export function AssetsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [form, setForm] = useState({ name: '', description: '', location: '', serialNumber: '' });
  const [error, setError] = useState('');

  const [scheduleAsset, setScheduleAsset] = useState<AssetRow | null>(null);
  const [schedule, setSchedule] = useState<Array<{ periodDate: string; bookValue: string; projected: boolean }>>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  function openEdit(asset: AssetRow) {
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      description: asset.description ?? '',
      location: asset.location ?? '',
      serialNumber: asset.serialNumber ?? '',
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAsset) return;
    setError('');
    try {
      await client.updateAsset(editingAsset.id, form);
      setEditingAsset(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function openSchedule(asset: AssetRow) {
    setScheduleAsset(asset);
    setScheduleLoading(true);
    try {
      const data = await client.getAssetDepreciationSchedule(asset.id);
      setSchedule(data.timeline);
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('nav.assets')} subtitle={t('modules.assets.description')} />
      <DataTable<AssetRow>
        refreshKey={refreshKey}
        exportFilename="assets"
        fetchData={(c) => c.getAssets()}
        columns={[
          { key: 'code', label: t('customers.code') },
          { key: 'name', label: t('products.name') },
          { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
          {
            key: 'acquisitionCost',
            label: t('assets.cost'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.acquisitionCost), user?.currency ?? 'EGP'),
            exportValue: (row) => Number(row.acquisitionCost),
          },
          {
            key: 'bookValue',
            label: t('assets.bookValue'),
            align: 'end',
            render: (row) => formatCurrency(Number(row.bookValue ?? 0), user?.currency ?? 'EGP'),
            exportValue: (row) => Number(row.bookValue ?? 0),
          },
          {
            key: 'actions',
            label: t('common.actions'),
            exportValue: () => '',
            render: (row) => (
              <div className="row-actions">
                <button type="button" className="btn-link" onClick={() => void openSchedule(row)}>{t('assets.viewSchedule')}</button>
                <button type="button" className="btn-link" onClick={() => openEdit(row)}>{t('common.edit')}</button>
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!editingAsset} title={t('assets.editAsset')} onClose={() => setEditingAsset(null)}>
        <form onSubmit={(e) => void handleSave(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('products.name')} required>
            <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </FormField>
          <FormField label={t('assets.location')}>
            <input className="form-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </FormField>
          <FormField label={t('assets.serialNumber')}>
            <input className="form-input" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingAsset(null)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={!!scheduleAsset} title={t('assets.depreciationSchedule')} onClose={() => setScheduleAsset(null)}>
        {scheduleLoading ? (
          <p>{t('common.loading')}</p>
        ) : schedule.length === 0 ? (
          <p>{t('common.noDataHint')}</p>
        ) : (
          <>
            <LineChart
              points={schedule.map((s) => ({ x: s.periodDate, y: Number(s.bookValue), projected: s.projected }))}
              formatY={(v) => formatCurrency(v, user?.currency ?? 'EGP')}
            />
            <p className="page-subtitle chart-legend" style={{ marginTop: '0.5rem' }}>
              <span className="chart-legend__swatch chart-legend__swatch--actual" /> {t('assets.actual')}
              <span className="chart-legend__swatch chart-legend__swatch--projected" /> {t('assets.projected')}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}
