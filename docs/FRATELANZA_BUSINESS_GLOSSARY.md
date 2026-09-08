# Fratelanza Business Glossary

**Date:** 2026-09-08  
**Purpose:** Consistent business terminology for Arabic/English UI, documentation, sales demos, and support.

Use these terms in product copy, training, and the demo checklist. Avoid internal names (`tenantId`, `partyId`, `EntitlementGuard`, etc.) in user-facing text.

---

## Core Master Data

### Party | جهة اتصال / طرف

| | |
|---|---|
| **English** | Party |
| **Arabic** | جهة اتصال — or **الطرف** in formal/construction contexts |
| **Business meaning** | A person or organization that can play one or more business roles (customer, supplier, subcontractor). The unified contact record for the platform. |
| **Where used** | Parties screen; construction contracts; optional sales/purchasing when Party routing is enabled; finance dimensions |

---

### Customer | عميل

| | |
|---|---|
| **English** | Customer |
| **Arabic** | عميل |
| **Business meaning** | A buyer who purchases goods or services from your company. Generates sales invoices and receivables. |
| **Where used** | Customers screen; Sales; POS; accounting receivables; dashboard payables/receivables |

**Note:** A Party can be assigned the **customer** role. Legacy **Customers** table still exists for trading workflows until Party routing is fully adopted.

---

### Supplier | مورد

| | |
|---|---|
| **English** | Supplier |
| **Arabic** | مورد |
| **Business meaning** | A vendor who sells goods or services to your company. Generates purchase orders and payables. |
| **Where used** | Suppliers screen; Purchasing; inventory receipts; accounting payables |

---

### Product | منتج

| | |
|---|---|
| **English** | Product |
| **Arabic** | منتج |
| **Business meaning** | A physical item you buy, stock, and sell. Identified by SKU, unit of measure, and prices. |
| **Where used** | Products; Inventory; Sales; Purchasing; POS; construction material issues |

---

### Service | خدمة

| | |
|---|---|
| **English** | Service |
| **Arabic** | خدمة |
| **Business meaning** | An intangible offering billed by time, project, or fixed fee — not stocked in a warehouse. |
| **Where used** | Professional services demo tenant; PMS module (API); future service catalog in Products |

**Note:** Desktop Products screen is stock-oriented today; services are better represented in the Services demo tenant seed data.

---

### Warehouse | مخزن

| | |
|---|---|
| **English** | Warehouse |
| **Arabic** | مخزن |
| **Business meaning** | A physical storage location where inventory quantities are tracked. |
| **Where used** | Warehouses; Inventory balances; Sales (stock issue); Purchasing (receipt) |

---

## Projects & Finance Dimensions

### Project | مشروع

| | |
|---|---|
| **English** | Project |
| **Arabic** | مشروع |
| **Business meaning** | A job, contract site, or engagement used to group costs and revenue for reporting. |
| **Where used** | Projects; Cost Centers; construction contracts; optional sales posting dimensions |

---

### Cost Center | مركز تكلفة

| | |
|---|---|
| **English** | Cost Center |
| **Arabic** | مركز تكلفة |
| **Business meaning** | A department or activity bucket for allocating expenses and analyzing profitability (e.g. "Site Operations", "Administration"). |
| **Where used** | Cost Centers screen; finance posting dimensions; construction costing (API) |

---

### Journal Entry | قيد يومية

| | |
|---|---|
| **English** | Journal Entry |
| **Arabic** | قيد يومية |
| **Business meaning** | An accounting record that debits and credits accounts to reflect a business event (sale, payment, adjustment). |
| **Where used** | Accounting module; automatic posting from sales/purchasing; Finance GL (API); trial balance on desktop |

---

## Construction Vertical

### Contract | عقد

| | |
|---|---|
| **English** | Contract |
| **Arabic** | عقد |
| **Business meaning** | A formal agreement with a customer (revenue) or subcontractor (cost) tied to a project, with defined scope and pricing. |
| **Where used** | Construction Contracts; BOQ; progress; billing; retention (API) |

---

### BOQ (Bill of Quantities) | جدول كميات

| | |
|---|---|
| **English** | BOQ — Bill of Quantities |
| **Arabic** | جدول كميات |
| **Business meaning** | Detailed list of work items, materials, and quantities with unit rates — the priced scope of a construction contract. |
| **Where used** | Construction BOQ (desktop route `/construction/boq/:id`); progress measurement; billing (API) |

---

### Progress | مستخلص / تقدم أعمال

| | |
|---|---|
| **English** | Progress (work completed) |
| **Arabic** | مستخلص — or **تقدم الأعمال** for period progress |
| **Business meaning** | Record of work completed in a period against BOQ lines, basis for interim billing and cost recognition. |
| **Where used** | Construction Progress screen; billing certificates (API) |

---

### Variation | أمر تغيير / variation

| | |
|---|---|
| **English** | Variation (change order) |
| **Arabic** | أمر تغيير — or **تعديل على العقد** |
| **Business meaning** | Approved change to contract scope, quantity, or price after the original BOQ. |
| **Where used** | Construction variations (API only — no desktop UI yet) |

---

### Retention | ضمان أعمال / حجز مالي

| | |
|---|---|
| **English** | Retention |
| **Arabic** | ضمان أعمال — or **حجز مالي** |
| **Business meaning** | Percentage of certified work value withheld until project completion or warranty period ends. |
| **Where used** | Construction retention (API); subcontractor and customer billing flows |

---

### Advance | دفعة مقدمة

| | |
|---|---|
| **English** | Advance (payment) |
| **Arabic** | دفعة مقدمة |
| **Business meaning** | Money paid before work is done, recovered later against progress invoices. |
| **Where used** | Construction advances (API); customer and subcontractor payment schedules |

---

### Material Issue | صرف مواد

| | |
|---|---|
| **English** | Material Issue |
| **Arabic** | صرف مواد |
| **Business meaning** | Issuing stock from warehouse to a project or contract, charging project cost. |
| **Where used** | Construction material issue (API); inventory ledger; project costing reports |

---

## Usage Guidelines

### Preferred UI labels (Arabic)

| Concept | Prefer | Avoid |
|---------|--------|-------|
| Party | جهات الاتصال | طرف (database) |
| BOQ | جدول الكميات | BOQ raw acronym without translation |
| Progress | مستخلصات | Progress (English only) |
| Retention | ضمان الأعمال | Retention % without explanation |

### Consistency rules

1. **Customer vs Party:** In trading demos, say "عميل" when using the Customers screen; explain that Parties unify customers and suppliers for larger businesses.
2. **Contract direction:** Always clarify **customer contract** (money in) vs **subcontractor contract** (money out).
3. **Draft vs Posted:** Use **مسودة** / **مرحّل** for document states affecting stock and accounts.
4. Do not expose permission keys (`sales:invoices:post`) or internal codes in user help text.

---

## Related Documents

- Field semantics: `docs/FIELD_DEFINITION_AUDIT.md`
- Demo walkthrough: `docs/PRODUCT_DEMO_CHECKLIST.md`
- Commercial positioning: `docs/COMMERCIAL_PRODUCT_REVIEW.md`

---

*This glossary satisfies Step 15 of the Fratelanza Product Reset brief.*
