import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/DataTable';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAppStore, useAuthStore } from '../stores';

interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export function PosPage() {
  const { t } = useTranslation();
  const apiUrl = useAppStore((s) => s.apiUrl);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<Array<{ id: string; name: string; salePrice: number; barcode?: string }>>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState('');
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();

  const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);

  useEffect(() => {
    async function init() {
      setShiftLoading(true);
      setMessage('');
      try {
        const [productList, warehouses] = await Promise.all([
          client.getProducts(),
          client.getWarehouses(),
        ]);
        setProducts(productList.filter((p) => p.isActive));
        setWarehouseId(warehouses.find((w) => w.isActive)?.id);

        if (!user?.branchId) {
          setMessage(t('pos.noBranch'));
          return;
        }

        const shift = await client.openPosShift({ branchId: user.branchId, openingCash: 0 });
        setShiftId(shift.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t('errors.generic'));
      } finally {
        setShiftLoading(false);
      }
    }
    void init();
  }, [apiUrl, accessToken, user?.branchId, t]);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? '').includes(search),
  );

  const addToCart = useCallback((p: { id: string; name: string; salePrice: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { productId: p.id, name: p.name, unitPrice: Number(p.salePrice), quantity: 1 }];
    });
  }, []);

  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  async function checkout() {
    if (cart.length === 0 || !shiftId || !user?.branchId) return;
    setMessage('');
    try {
      const result = await client.postPosSale({
        branchId: user.branchId,
        shiftId,
        warehouseId,
        lines: cart.map((i) => ({
          productId: i.productId,
          description: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        payments: [{ method: 'cash', amount: total }],
      });
      setCart([]);
      setMessage(`${t('pos.saleComplete')} (${result.number})`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('errors.generic'));
    }
  }

  if (shiftLoading) {
    return (
      <div>
        <PageHeader title={t('nav.pos')} />
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      <PageHeader title={t('nav.pos')} subtitle={shiftId ? t('pos.shiftOpen') : undefined} />
      <div className="pos-grid">
        <div className="card">
          <input
            className="form-input"
            placeholder={t('pos.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="pos-products">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pos-product-btn"
                onClick={() => addToCart(p)}
                disabled={!shiftId}
              >
                <span>{p.name}</span>
                <span>{Number(p.salePrice).toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card pos-cart">
          <h3>{t('pos.cart')}</h3>
          {cart.map((item) => (
            <div key={item.productId} className="pos-cart-line">
              <span>{item.name} x{item.quantity}</span>
              <span>{(item.unitPrice * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="pos-total">
            <strong>{t('pos.total')}</strong>
            <strong>{total.toFixed(2)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => void checkout()}
            disabled={!shiftId || cart.length === 0}
          >
            {t('pos.checkout')}
          </button>
          {message && <p style={{ marginTop: 12 }}>{message}</p>}
        </div>
      </div>
    </div>
  );
}
