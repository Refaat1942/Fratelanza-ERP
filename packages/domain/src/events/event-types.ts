export const DomainEvents = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  TENANT_CREATED: 'TENANT_CREATED',
  BRANCH_CREATED: 'BRANCH_CREATED',
  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  tenantId: string;
  entityId: string;
  payload: T;
  occurredAt: Date;
  userId?: string;
  deviceId?: string;
}
