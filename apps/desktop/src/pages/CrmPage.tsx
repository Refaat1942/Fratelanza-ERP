import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConfirmDialog, DataTable, FormActions, FormField, Modal, PageHeader, StatusBadge, useApiClient,
} from '../components/DataTable';
import { PageState } from '../components/PageState';
import { formatCurrency } from '../lib/format';
import { useAuthStore } from '../stores';
import type { CrmLeadRow, CrmOpportunityRow } from '../lib/api';

const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;

export function CrmPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const user = useAuthStore((s) => s.user);
  const [refreshKey, setRefreshKey] = useState(0);

  // Leads
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<CrmLeadRow | null>(null);
  const [leadForm, setLeadForm] = useState({ contactName: '', companyName: '', email: '', phone: '' });
  const [deleteLeadTarget, setDeleteLeadTarget] = useState<CrmLeadRow | null>(null);
  const [error, setError] = useState('');

  // Opportunities (Kanban)
  const [opportunities, setOpportunities] = useState<CrmOpportunityRow[]>([]);
  const [oppLoading, setOppLoading] = useState(true);
  const [oppModalOpen, setOppModalOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<CrmOpportunityRow | null>(null);
  const [oppForm, setOppForm] = useState({ name: '', amount: 0, probability: 0 });
  const [deleteOppTarget, setDeleteOppTarget] = useState<CrmOpportunityRow | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const loadOpportunities = useCallback(async () => {
    setOppLoading(true);
    try {
      setOpportunities(await client.getCrmOpportunities());
    } finally {
      setOppLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  function openCreateLead() {
    setEditingLead(null);
    setLeadForm({ contactName: '', companyName: '', email: '', phone: '' });
    setLeadModalOpen(true);
  }

  function openEditLead(lead: CrmLeadRow) {
    setEditingLead(lead);
    setLeadForm({
      contactName: lead.contactName,
      companyName: lead.companyName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
    });
    setLeadModalOpen(true);
  }

  async function handleSaveLead(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editingLead) {
        await client.updateCrmLead(editingLead.id, leadForm);
      } else {
        await client.createCrmLead(leadForm);
      }
      setLeadModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleConvertLead(lead: CrmLeadRow) {
    await client.convertCrmLead(lead.id);
    setRefreshKey((k) => k + 1);
    await loadOpportunities();
  }

  async function handleDeleteLead() {
    if (!deleteLeadTarget) return;
    await client.deleteCrmLead(deleteLeadTarget.id);
    setDeleteLeadTarget(null);
    setRefreshKey((k) => k + 1);
  }

  function openCreateOpportunity() {
    setEditingOpp(null);
    setOppForm({ name: '', amount: 0, probability: 0 });
    setOppModalOpen(true);
  }

  function openEditOpportunity(opp: CrmOpportunityRow) {
    setEditingOpp(opp);
    setOppForm({ name: opp.name, amount: Number(opp.amount), probability: opp.probability ?? 0 });
    setOppModalOpen(true);
  }

  async function handleSaveOpportunity(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editingOpp) {
        await client.updateCrmOpportunity(editingOpp.id, oppForm);
      } else {
        await client.createCrmOpportunity(oppForm);
      }
      setOppModalOpen(false);
      await loadOpportunities();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleDeleteOpportunity() {
    if (!deleteOppTarget) return;
    await client.deleteCrmOpportunity(deleteOppTarget.id);
    setDeleteOppTarget(null);
    await loadOpportunities();
  }

  async function handleDrop(stage: string, oppId: string) {
    setDragOverStage(null);
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage === stage) return;
    setOpportunities((prev) => prev.map((o) => (o.id === oppId ? { ...o, stage } : o)));
    try {
      await client.moveCrmOpportunityStage(oppId, stage);
    } catch {
      await loadOpportunities();
    }
  }

  const pipelineValue = opportunities
    .filter((o) => o.stage !== 'lost')
    .reduce((sum, o) => sum + Number(o.amount), 0);

  return (
    <div>
      <PageHeader
        title={t('nav.crm')}
        subtitle={t('modules.crm.description')}
        action={
          <button type="button" className="btn btn-primary" onClick={openCreateLead}>
            {t('crm.createLead')}
          </button>
        }
      />

      <h2 className="module-card-title">{t('crm.leads')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        <DataTable<CrmLeadRow>
          refreshKey={refreshKey}
          exportFilename="crm-leads"
          fetchData={(c) => c.getCrmLeads()}
          columns={[
            { key: 'code', label: t('customers.code') },
            {
              key: 'contactName',
              label: t('customers.name'),
              render: (row) => (row.companyName ? `${row.contactName} · ${row.companyName}` : row.contactName),
              exportValue: (row) => (row.companyName ? `${row.contactName} · ${row.companyName}` : row.contactName),
            },
            { key: 'status', label: t('common.status'), render: (row) => <StatusBadge status={row.status} /> },
            {
              key: 'actions',
              label: t('common.actions'),
              exportValue: () => '',
              render: (row) => (
                <div className="row-actions">
                  <button type="button" className="btn-link" onClick={() => openEditLead(row)}>{t('common.edit')}</button>
                  {row.status !== 'converted' && (
                    <button type="button" className="btn-link" onClick={() => void handleConvertLead(row)}>{t('crm.convert')}</button>
                  )}
                  {row.status !== 'converted' && (
                    <button type="button" className="btn-link btn-link--danger" onClick={() => setDeleteLeadTarget(row)}>{t('common.delete')}</button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="module-card-title">
          {t('crm.opportunities')}
          <span className="module-card-subtitle"> · {formatCurrency(pipelineValue, user?.currency ?? 'EGP')} {t('crm.pipelineValue')}</span>
        </h2>
        <button type="button" className="btn btn-primary btn--sm" onClick={openCreateOpportunity}>
          {t('crm.newOpportunity')}
        </button>
      </div>

      {oppLoading ? (
        <PageState variant="loading" />
      ) : (
        <div className="kanban-board">
          {STAGES.map((stage) => {
            const stageOpps = opportunities.filter((o) => o.stage === stage);
            const stageTotal = stageOpps.reduce((sum, o) => sum + Number(o.amount), 0);
            return (
              <div
                key={stage}
                className={`kanban-column ${dragOverStage === stage ? 'is-drop-target' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const oppId = e.dataTransfer.getData('text/opportunity-id');
                  if (oppId) void handleDrop(stage, oppId);
                }}
              >
                <div className="kanban-column__header">
                  <span>{t(`status.${stage}`)}</span>
                  <span>{formatCurrency(stageTotal, user?.currency ?? 'EGP')}</span>
                </div>
                {stageOpps.map((opp) => (
                  <div
                    key={opp.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/opportunity-id', opp.id)}
                  >
                    <div className="kanban-card__title">{opp.name}</div>
                    <div className="kanban-card__amount">{formatCurrency(Number(opp.amount), opp.currencyCode ?? user?.currency ?? 'EGP')}</div>
                    <div className="kanban-card__actions">
                      <button type="button" onClick={() => openEditOpportunity(opp)}>{t('common.edit')}</button>
                      <button type="button" onClick={() => setDeleteOppTarget(opp)}>{t('common.delete')}</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={leadModalOpen} title={editingLead ? t('crm.editLead') : t('crm.createLead')} onClose={() => setLeadModalOpen(false)}>
        <form onSubmit={(e) => void handleSaveLead(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('customers.name')} required>
            <input className="form-input" value={leadForm.contactName} onChange={(e) => setLeadForm({ ...leadForm, contactName: e.target.value })} required />
          </FormField>
          <FormField label={t('tenants.name')}>
            <input className="form-input" value={leadForm.companyName} onChange={(e) => setLeadForm({ ...leadForm, companyName: e.target.value })} />
          </FormField>
          <FormField label={t('auth.email')}>
            <input className="form-input" type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
          </FormField>
          <FormField label={t('bank.accountNumber')}>
            <input className="form-input" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="+20..." />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setLeadModalOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <Modal open={oppModalOpen} title={editingOpp ? t('crm.editOpportunity') : t('crm.newOpportunity')} onClose={() => setOppModalOpen(false)}>
        <form onSubmit={(e) => void handleSaveOpportunity(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('customers.name')} required>
            <input className="form-input" value={oppForm.name} onChange={(e) => setOppForm({ ...oppForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('sales.total')}>
            <input className="form-input" type="number" min={0} step="0.01" value={oppForm.amount} onChange={(e) => setOppForm({ ...oppForm, amount: Number(e.target.value) })} />
          </FormField>
          <FormField label={t('crm.probability')}>
            <input className="form-input" type="number" min={0} max={100} value={oppForm.probability} onChange={(e) => setOppForm({ ...oppForm, probability: Number(e.target.value) })} />
          </FormField>
          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOppModalOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteLeadTarget}
        title={t('common.confirmDeleteTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDeleteLead()}
        onCancel={() => setDeleteLeadTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteOppTarget}
        title={t('common.confirmDeleteTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDeleteOpportunity()}
        onCancel={() => setDeleteOppTarget(null)}
      />
    </div>
  );
}
