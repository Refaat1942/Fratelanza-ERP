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
};

export type TranslationKeys = typeof en;
