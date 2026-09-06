import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { UnitsService } from './units.service';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { UnitsController } from './units.controller';

@Module({
  providers: [ProductsService, CategoriesService, UnitsService],
  controllers: [ProductsController, CategoriesController, UnitsController],
  exports: [ProductsService, CategoriesService, UnitsService],
})
export class ProductsModule {}
