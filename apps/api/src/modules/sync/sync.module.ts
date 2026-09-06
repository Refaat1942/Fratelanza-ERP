import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncProcessorService } from './sync-processor.service';
import { SyncController } from './sync.controller';
import { CustomersModule } from '../customers/customers.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [CustomersModule, SuppliersModule, ProductsModule],
  providers: [SyncService, SyncProcessorService],
  controllers: [SyncController],
  exports: [SyncService, SyncProcessorService],
})
export class SyncModule {}
