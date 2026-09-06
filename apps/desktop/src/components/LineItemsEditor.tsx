import { useTranslation } from 'react-i18next';

export interface DocumentLineItem {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface ProductOption {
  id: string;
  name: string;
  salePrice: number;
  sku?: string;
}

interface LineItemsEditorProps {
  lines: DocumentLineItem[];
  products: ProductOption[];
  onChange: (lines: DocumentLineItem[]) => void;
}

export function LineItemsEditor({ lines, products, onChange }: LineItemsEditorProps) {
  const { t } = useTranslation();

  function addLine() {
    onChange([
      ...lines,
      { productId: '', description: '', quantity: 1, unitPrice: 0 },
    ]);
  }

  function updateLine(index: number, patch: Partial<DocumentLineItem>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateLine(index, {
      productId: product.id,
      description: product.name,
      unitPrice: Number(product.salePrice),
    });
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  return (
    <div>
      {lines.map((line, index) => (
        <div key={index} className="line-item-row">
          <select
            className="select-input"
            value={line.productId}
            onChange={(e) => selectProduct(index, e.target.value)}
          >
            <option value="">{t('lineItems.selectProduct')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku ? `${p.sku} — ` : ''}{p.name}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            type="number"
            min="0.0001"
            step="0.01"
            value={line.quantity}
            onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
          />
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={line.unitPrice}
            onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
          />
          <button type="button" className="btn btn-ghost" onClick={() => removeLine(index)}>
            {t('common.delete')}
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={addLine}>
          {t('lineItems.addLine')}
        </button>
        <strong>{t('lineItems.total')}: {total.toFixed(2)}</strong>
      </div>
    </div>
  );
}
