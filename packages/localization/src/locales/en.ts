export const en = {
  common: {
    appName: 'Fratelanza Grand ERP',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    print: 'Print',
    loading: 'Loading...',
    noData: 'No data available',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    yes: 'Yes',
    no: 'No',
    actions: 'Actions',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
  },
  auth: {
    login: 'Sign In',
    logout: 'Sign Out',
    email: 'Email',
    password: 'Password',
    rememberMe: 'Remember me',
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in to your ERP account',
    invalidCredentials: 'Invalid email or password',
    sessionExpired: 'Your session has expired. Please sign in again.',
  },
  nav: {
    dashboard: 'Dashboard',
    companies: 'Companies',
    branches: 'Branches',
    warehouses: 'Warehouses',
    users: 'Users',
    roles: 'Roles',
    devices: 'Devices',
    settings: 'Settings',
    auditLogs: 'Audit Logs',
    products: 'Products',
    customers: 'Customers',
    suppliers: 'Suppliers',
    inventory: 'Inventory',
    sales: 'Sales',
    purchasing: 'Purchasing',
    accounting: 'Accounting',
    pos: 'POS',
  },
  dashboard: {
    title: 'Dashboard',
    welcome: 'Welcome, {{name}}',
    salesToday: 'Sales Today',
    salesMonth: 'Sales This Month',
    receivables: 'Outstanding Receivables',
    payables: 'Outstanding Payables',
    inventoryValue: 'Inventory Value',
    lowStock: 'Low Stock Items',
  },
  sync: {
    online: 'Online',
    offline: 'Offline',
    syncing: 'Syncing...',
    syncError: 'Sync Error',
    lastSync: 'Last sync: {{time}}',
    pendingChanges: '{{count}} pending changes',
    syncNow: 'Sync now',
    localProducts: '{{count}} cached locally',
    applied: 'Synced {{count}} records · {{local}} products offline',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    company: 'Company Settings',
    timezone: 'Timezone',
    currency: 'Default Currency',
  },
  tenants: {
    title: 'Companies',
    name: 'Company Name',
    code: 'Company Code',
    create: 'Create Company',
  },
  branches: {
    title: 'Branches',
    name: 'Branch Name',
    code: 'Branch Code',
    create: 'Create Branch',
  },
  users: {
    title: 'Users',
    name: 'Full Name',
    email: 'Email',
    role: 'Role',
    branch: 'Branch',
    create: 'Create User',
  },
  devices: {
    title: 'Devices',
    name: 'Device Name',
    status: 'Status',
    lastSeen: 'Last Seen',
    version: 'App Version',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    network: 'Network error. Check your connection.',
    unauthorized: 'You are not authorized to perform this action.',
    notFound: 'The requested resource was not found.',
  },
  products: {
    name: 'Product Name',
    price: 'Price',
    barcode: 'Barcode',
    create: 'New Product',
    edit: 'Edit Product',
    unitRequired: 'No unit of measure found. Run database seed first.',
  },
  customers: {
    code: 'Code',
    name: 'Name',
    phone: 'Phone',
    balance: 'Balance',
    create: 'New Customer',
    edit: 'Edit Customer',
  },
  suppliers: {
    code: 'Code',
    name: 'Name',
    balance: 'Balance',
    create: 'New Supplier',
    edit: 'Edit Supplier',
  },
  inventory: {
    quantity: 'Quantity',
    adjust: 'Adjust Stock',
    adjusted: 'Stock adjusted successfully',
    notes: 'Notes',
    requiredFields: 'Select warehouse and product',
  },
  sales: {
    number: 'Invoice #',
    total: 'Total',
    post: 'Post',
    posted: 'Invoice posted successfully',
    create: 'New Sales Invoice',
    created: 'Invoice created',
  },
  purchasing: {
    number: 'PO #',
    receive: 'Receive',
    received: 'Purchase order received',
    create: 'New Purchase Order',
    created: 'Purchase order created',
    requiredFields: 'Select supplier and warehouse',
  },
  accounting: {
    trialBalance: 'Trial Balance',
    code: 'Account Code',
    name: 'Account Name',
    debit: 'Debit',
    credit: 'Credit',
    seedCoa: 'Seed Chart of Accounts',
    seeded: 'Seeded {{count}} accounts',
  },
  pos: {
    searchPlaceholder: 'Search products or scan barcode...',
    cart: 'Cart',
    total: 'Total',
    checkout: 'Checkout',
    saleComplete: 'Sale completed successfully',
    shiftOpen: 'Shift is open',
    noBranch: 'Your user has no branch assigned. Contact an administrator.',
  },
  lineItems: {
    selectProduct: 'Select product',
    addLine: 'Add line',
    total: 'Line total',
    required: 'Add at least one line item',
  },
} as const;

export type TranslationSchema = {
  common: Record<string, string>;
  auth: Record<string, string>;
  nav: Record<string, string>;
  dashboard: Record<string, string>;
  sync: Record<string, string>;
  settings: Record<string, string>;
  tenants: Record<string, string>;
  branches: Record<string, string>;
  users: Record<string, string>;
  devices: Record<string, string>;
  errors: Record<string, string>;
  products: Record<string, string>;
  customers: Record<string, string>;
  suppliers: Record<string, string>;
  inventory: Record<string, string>;
  sales: Record<string, string>;
  purchasing: Record<string, string>;
  accounting: Record<string, string>;
  pos: Record<string, string>;
  lineItems: Record<string, string>;
};

export type TranslationKeys = typeof en;
