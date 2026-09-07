import { IsUUID } from 'class-validator';

export class LinkLegacyCustomerDto {
  @IsUUID()
  customerId!: string;
}

export class LinkLegacySupplierDto {
  @IsUUID()
  supplierId!: string;
}
