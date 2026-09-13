import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiClient } from './DataTable';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function AssistantWidget() {
  const { t } = useTranslation();
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setError('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const result = await client.chatWithAssistant(text, messages);
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('assistant.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('assistant.title')}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="assistant-panel" role="dialog" aria-label={t('assistant.title')}>
          <div className="assistant-panel-header">
            <div>
              <strong>{t('assistant.title')}</strong>
              <p className="assistant-panel-subtitle">{t('assistant.subtitle')}</p>
            </div>
            <button type="button" className="btn-link" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>

          <div className="assistant-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p>{t('assistant.emptyHint')}</p>
                <ul>
                  <li>{t('assistant.example1')}</li>
                  <li>{t('assistant.example2')}</li>
                  <li>{t('assistant.example3')}</li>
                </ul>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-bubble assistant-bubble--${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="assistant-bubble assistant-bubble--assistant assistant-bubble--loading">
                {t('assistant.thinking')}
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
          </div>

          <form className="assistant-input-row" onSubmit={(e) => void send(e)}>
            <input
              className="form-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('assistant.placeholder')}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary btn--sm" disabled={loading || !input.trim()}>
              {t('assistant.send')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
