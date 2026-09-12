import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COUNTRY_PROFILES, type CountryCode } from '@fratelanza/shared';
import { PageHeader } from '../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';

type IntegrationStatus = {
  authority: string;
  environment: string;
  connectionStatus?: string;
  certificateStatus?: string;
  credentialsStatus: string;
  pendingDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  lastSubmission: string | null;
  configurationRequired: string[];
};

type IntegrationLog = {
  id: string;
  authority: string;
  documentType: string;
  documentNumber?: string | null;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
};

export function IntegrationsPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const countryCode = (user?.countryCode ?? 'SA') as CountryCode;
  const profile = COUNTRY_PROFILES[countryCode];

  const [summary, setSummary] = useState<{
    countryCode: CountryCode;
    currency: string;
    timezone: string;
    integration: IntegrationStatus;
  } | null>(null);
  const [egyptStatus, setEgyptStatus] = useState<{
    eInvoice: IntegrationStatus;
    eReceipt: IntegrationStatus & { channel?: string };
  } | null>(null);
  const [saudiStatus, setSaudiStatus] = useState<IntegrationStatus | null>(null);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const client = createApiClient(
        () => resolveApiBaseUrl(apiUrl),
        () => accessToken,
      );
      const countryRes = await client.getIntegrationCountry();
      setSummary({
        ...countryRes,
        countryCode: countryRes.countryCode as CountryCode,
      });
      setEnvironment(countryRes.integration.environment as 'sandbox' | 'production');

      const logRes = await client.getIntegrationLogs();
      setLogs(logRes);

      if (countryCode === 'EG') {
        const status = await client.getEgyptIntegrationStatus();
        setEgyptStatus({
          eInvoice: {
            ...status.eInvoice,
            pendingDocuments: status.eInvoice.pendingDocuments ?? 0,
            successfulDocuments: status.eInvoice.successfulDocuments ?? 0,
            failedDocuments: status.eInvoice.failedDocuments ?? 0,
          },
          eReceipt: {
            ...status.eReceipt,
            pendingDocuments: status.eReceipt.pendingDocuments ?? 0,
            successfulDocuments: status.eReceipt.successfulDocuments ?? 0,
            failedDocuments: status.eReceipt.failedDocuments ?? 0,
          },
        });
      } else {
        const status = await client.getSaudiIntegrationStatus();
        setSaudiStatus(status);
      }
    }
    void load();
  }, [apiUrl, accessToken, countryCode]);

  async function saveEnvironment() {
    setMessage('');
    const client = createApiClient(
      () => resolveApiBaseUrl(apiUrl),
      () => accessToken,
    );
    if (countryCode === 'EG') {
      await client.updateEgyptIntegrationSettings({ environment });
    } else {
      await client.updateSaudiIntegrationSettings({ environment });
    }
    setMessage(t('integrations.saved'));
  }

  return (
    <div>
      <PageHeader
        title={t('integrations.title')}
        subtitle={t('integrations.subtitle', { country: profile.name })}
        breadcrumbs={[
          { label: t('nav.settings'), to: '/settings' },
          { label: t('integrations.title') },
        ]}
      />

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <h2 className="card-title">{t('integrations.organizationContext')}</h2>
        <div className="settings-row">
          <span>{t('integrations.country')}</span>
          <span>{profile.flag} {profile.name}</span>
        </div>
        <div className="settings-row">
          <span>{t('integrations.currency')}</span>
          <span>{summary?.currency ?? user?.currency}</span>
        </div>
        <div className="settings-row">
          <span>{t('integrations.taxAuthority')}</span>
          <span>{profile.taxAuthority}</span>
        </div>
        <div className="settings-row">
          <span>{t('integrations.eInvoicing')}</span>
          <span>{profile.eInvoicingProvider}</span>
        </div>
      </div>

      <div className="card card--flat" style={{ marginBottom: 'var(--frz-space-4)' }}>
        <h2 className="card-title">
          {countryCode === 'EG' ? t('integrations.egyptCenter') : t('integrations.saudiCenter')}
        </h2>
        <div className="settings-row">
          <span>{t('integrations.environment')}</span>
          <select
            className="select-input"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'production')}
          >
            <option value="sandbox">{t('integrations.sandbox')}</option>
            <option value="production">{t('integrations.production')}</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void saveEnvironment()}>
          {t('integrations.saveEnvironment')}
        </button>
        {message && <p className="form-success">{message}</p>}

        {countryCode === 'EG' && egyptStatus && (
          <>
            <h3 className="card-title" style={{ marginTop: 'var(--frz-space-4)' }}>
              {t('integrations.eInvoiceStatus')}
            </h3>
            <IntegrationStats status={egyptStatus.eInvoice} />
            <h3 className="card-title" style={{ marginTop: 'var(--frz-space-4)' }}>
              {t('integrations.eReceiptStatus')}
            </h3>
            <IntegrationStats status={egyptStatus.eReceipt} />
          </>
        )}

        {countryCode === 'SA' && saudiStatus && <IntegrationStats status={saudiStatus} />}
      </div>

      <div className="card card--flat">
        <h2 className="card-title">{t('integrations.logsTitle')}</h2>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('integrations.table.authority')}</th>
                <th>{t('integrations.table.document')}</th>
                <th>{t('integrations.table.status')}</th>
                <th>{t('integrations.table.time')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4}>{t('integrations.noLogs')}</td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.authority}</td>
                  <td>{log.documentNumber ?? log.documentType}</td>
                  <td>
                    <span className={`badge badge--${log.status}`}>{log.status}</span>
                  </td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IntegrationStats({ status }: { status: IntegrationStatus }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="settings-row">
        <span>{t('integrations.credentialsStatus')}</span>
        <span>{status.credentialsStatus}</span>
      </div>
      <div className="settings-row">
        <span>{t('integrations.pendingDocuments')}</span>
        <span>{status.pendingDocuments}</span>
      </div>
      <div className="settings-row">
        <span>{t('integrations.successfulDocuments')}</span>
        <span>{status.successfulDocuments}</span>
      </div>
      <div className="settings-row">
        <span>{t('integrations.failedDocuments')}</span>
        <span>{status.failedDocuments}</span>
      </div>
      <div className="settings-row">
        <span>{t('integrations.lastSubmission')}</span>
        <span>{status.lastSubmission ? new Date(status.lastSubmission).toLocaleString() : t('integrations.none')}</span>
      </div>
      {status.configurationRequired.length > 0 && (
        <div style={{ marginTop: 'var(--frz-space-3)' }}>
          <strong>{t('integrations.configurationRequired')}</strong>
          <ul>
            {status.configurationRequired.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
