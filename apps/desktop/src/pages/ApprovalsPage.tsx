import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ConfirmDialog, FormActions, FormField, Modal, PageHeader, useApiClient,
} from '../components/DataTable';
import { StepTimeline } from '../components/ui/Charts';
import type { ApprovalRequestRow, ApprovalWorkflowRow } from '../lib/api';

type StepDraft = { sequence: number; name: string; approverRole: string };

function timelineFor(request: ApprovalRequestRow) {
  const steps = request.workflow?.steps ?? [];
  return steps.map((step) => {
    let state: 'done' | 'current' | 'rejected' | 'pending' = 'pending';
    if (request.status === 'rejected' && step.sequence === request.currentStepSequence) state = 'rejected';
    else if (step.sequence < (request.currentStepSequence ?? 1)) state = 'done';
    else if (step.sequence === request.currentStepSequence) state = request.status === 'approved' ? 'done' : 'current';
    return { label: step.name, state };
  });
}

export function ApprovalsPage() {
  const { t } = useTranslation();
  const client = useApiClient();

  const [pending, setPending] = useState<ApprovalRequestRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [workflows, setWorkflows] = useState<ApprovalWorkflowRow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<ApprovalWorkflowRow | null>(null);
  const [workflowForm, setWorkflowForm] = useState({ sourceModule: '', sourceType: '', name: '', minAmount: 0 });
  const [steps, setSteps] = useState<StepDraft[]>([{ sequence: 1, name: '', approverRole: '' }]);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ApprovalWorkflowRow | null>(null);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      setPending(await client.getPendingApprovals());
    } finally {
      setPendingLoading(false);
    }
  }, [client]);

  const loadWorkflows = useCallback(async () => {
    setWorkflowsLoading(true);
    try {
      setWorkflows(await client.getApprovalWorkflows());
    } finally {
      setWorkflowsLoading(false);
    }
  }, [client]);

  useEffect(() => { void loadPending(); }, [loadPending]);
  useEffect(() => { void loadWorkflows(); }, [loadWorkflows]);

  async function handleDecide(id: string, decision: 'approved' | 'rejected') {
    setDecidingId(id);
    try {
      await client.decideApprovalRequest(id, decision);
      await loadPending();
    } finally {
      setDecidingId(null);
    }
  }

  function openCreateWorkflow() {
    setEditingWorkflow(null);
    setWorkflowForm({ sourceModule: '', sourceType: '', name: '', minAmount: 0 });
    setSteps([{ sequence: 1, name: '', approverRole: '' }]);
    setWorkflowModalOpen(true);
  }

  function openEditWorkflow(workflow: ApprovalWorkflowRow) {
    setEditingWorkflow(workflow);
    setWorkflowForm({
      sourceModule: workflow.sourceModule,
      sourceType: workflow.sourceType,
      name: workflow.name,
      minAmount: Number(workflow.minAmount ?? 0),
    });
    setSteps(workflow.steps.map((s) => ({ sequence: s.sequence, name: s.name, approverRole: s.approverRole ?? '' })));
    setWorkflowModalOpen(true);
  }

  function addStep() {
    setSteps((prev) => [...prev, { sequence: prev.length + 1, name: '', approverRole: '' }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sequence: i + 1 })));
  }

  async function handleSaveWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const payload = { ...workflowForm, steps: steps.map((s) => ({ sequence: s.sequence, name: s.name, approverRole: s.approverRole || undefined })) };
    try {
      if (editingWorkflow) {
        await client.updateApprovalWorkflow(editingWorkflow.id, payload);
      } else {
        await client.createApprovalWorkflow(payload);
      }
      setWorkflowModalOpen(false);
      await loadWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  async function handleDeleteWorkflow() {
    if (!deleteTarget) return;
    await client.deleteApprovalWorkflow(deleteTarget.id);
    setDeleteTarget(null);
    await loadWorkflows();
  }

  return (
    <div>
      <PageHeader
        title={t('nav.approvals')}
        subtitle={t('modules.approvals.description')}
        action={
          <button type="button" className="btn btn-primary" onClick={openCreateWorkflow}>
            {t('approvals.newWorkflow')}
          </button>
        }
      />

      <h2 className="module-card-title">{t('approvals.pending')}</h2>
      <div style={{ marginBottom: '2rem' }}>
        {pendingLoading ? (
          <p>{t('common.loading')}</p>
        ) : pending.length === 0 ? (
          <p className="page-subtitle">{t('common.noDataHint')}</p>
        ) : (
          pending.map((request) => (
            <div key={request.id} className="card card--flat" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{request.sourceModule} · {request.sourceType} · {request.sourceId.slice(0, 8)}</strong>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn--sm"
                    disabled={decidingId === request.id}
                    onClick={() => void handleDecide(request.id, 'approved')}
                  >
                    {t('approvals.approve')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn--sm"
                    disabled={decidingId === request.id}
                    onClick={() => void handleDecide(request.id, 'rejected')}
                  >
                    {t('approvals.reject')}
                  </button>
                </div>
              </div>
              <StepTimeline steps={timelineFor(request)} />
            </div>
          ))
        )}
      </div>

      <h2 className="module-card-title">{t('approvals.workflows')}</h2>
      {workflowsLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('customers.name')}</th>
                <th>{t('approvals.module')}</th>
                <th>{t('approvals.document')}</th>
                <th>{t('approvals.steps')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf.id}>
                  <td>{wf.name}</td>
                  <td>{wf.sourceModule}</td>
                  <td>{wf.sourceType}</td>
                  <td>{wf.steps.map((s) => s.name).join(' → ')}</td>
                  <td className="row-actions">
                    <button type="button" className="btn-link" onClick={() => openEditWorkflow(wf)}>{t('common.edit')}</button>
                    <button type="button" className="btn-link btn-link--danger" onClick={() => setDeleteTarget(wf)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={workflowModalOpen} title={editingWorkflow ? t('approvals.editWorkflow') : t('approvals.newWorkflow')} onClose={() => setWorkflowModalOpen(false)}>
        <form onSubmit={(e) => void handleSaveWorkflow(e)}>
          {error && <p className="form-error">{error}</p>}
          <FormField label={t('customers.name')} required>
            <input className="form-input" value={workflowForm.name} onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })} required />
          </FormField>
          <FormField label={t('approvals.module')} required>
            <input className="form-input" value={workflowForm.sourceModule} onChange={(e) => setWorkflowForm({ ...workflowForm, sourceModule: e.target.value })} placeholder="purchasing" required disabled={!!editingWorkflow} />
          </FormField>
          <FormField label={t('approvals.document')} required>
            <input className="form-input" value={workflowForm.sourceType} onChange={(e) => setWorkflowForm({ ...workflowForm, sourceType: e.target.value })} placeholder="order" required disabled={!!editingWorkflow} />
          </FormField>
          <FormField label={t('approvals.minAmount')}>
            <input className="form-input" type="number" min={0} value={workflowForm.minAmount} onChange={(e) => setWorkflowForm({ ...workflowForm, minAmount: Number(e.target.value) })} />
          </FormField>

          <FormField label={t('approvals.steps')}>
            <div>
              {steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    className="form-input"
                    placeholder={t('approvals.stepName')}
                    value={step.name}
                    onChange={(e) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, name: e.target.value } : s)))}
                    required
                  />
                  <input
                    className="form-input"
                    placeholder={t('approvals.approverRole')}
                    value={step.approverRole}
                    onChange={(e) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, approverRole: e.target.value } : s)))}
                  />
                  {steps.length > 1 && (
                    <button type="button" className="btn-link btn-link--danger" onClick={() => removeStep(i)}>{t('common.delete')}</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-link" onClick={addStep}>{t('approvals.addStep')}</button>
            </div>
          </FormField>

          <FormActions>
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setWorkflowModalOpen(false)}>{t('common.cancel')}</button>
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.confirmDeleteTitle')}
        message={t('common.confirmDeleteMessage')}
        onConfirm={() => void handleDeleteWorkflow()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
