# PHASE 10.0 — COMMERCIAL QA

Explicit commercial licensing and deployment QA coverage.

---

## Automated Test Coverage

### Existing (Phase 4.5+)

| Test file | Coverage |
|-----------|----------|
| `licensing.integration.spec.ts` | Perpetual, time-limited, grace, suspended, module/feature gates |
| `license-hardening.integration.spec.ts` | Signature tampering, unsigned rejection, tenant binding |

### Phase 10.0 additions

| Test file | Coverage |
|-----------|----------|
| `production-config.spec.ts` | Production env fail-fast rules |
| `commercial-deployment.integration.spec.ts` | Version endpoint, diagnostics, installation binding, perpetual ops |

---

## Commercial Scenarios Matrix

| Scenario | Expected | Tested |
|----------|----------|--------|
| Perpetual license never auto-expires | Operational indefinitely | ✅ licensing + commercial |
| Time-limited expired | 403 on licensed modules | ✅ licensing |
| Time-limited grace | Operations allowed | ✅ licensing |
| Invalid signature | Rejected at activation | ✅ license-hardening |
| Tampered payload | Rejected at runtime | ✅ license-hardening |
| Wrong installationId | Rejected when server ID set | ✅ commercial-deployment |
| Unlicensed module | EntitlementGuard 403 | ✅ licensing |
| Licensed module | Allowed | ✅ licensing |
| RBAC denial | 403 independent of license | ✅ module integration tests |
| License ≠ RBAC bypass | Both enforced | ✅ design + integration |
| Sales stock without Inventory license | Allowed (side effect) | ✅ existing construction/sales tests |
| Construction entitlements isolated | Module-specific features | ✅ construction tests |

---

## Manual Production-Like Scenario

Documented in Customer Installation verification checklist:

1. Fresh PostgreSQL
2. Migrations applied
3. Production `.env` validated
4. License activated
5. Desktop LAN connect
6. Login → Party → Sales → Purchasing
7. Construction (if licensed)
8. Unlicensed module blocked
9. Backup run
10. Internet disconnected post-activation → operations continue

**Offline test:** Requires manual execution on staging LAN — not automated in CI.

---

## Test Execution

```bash
npm run test -w @fratelanza/api
npm run typecheck
npm run build:api
npm run build:desktop
```

Target: all tests PASS (baseline 478 + Phase 10.0 additions).
