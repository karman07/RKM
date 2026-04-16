import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(@InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>) {}

  create(dto: CreateSupplierDto) {
    return new this.supplierModel(dto).save();
  }

  async findAll() {
    return this.supplierModel.find().sort({ name: 1 }).exec();
  }

  async findOne(id: string) {
    const s = await this.supplierModel.findById(id).exec();
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const s = await this.supplierModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async remove(id: string) {
    const s = await this.supplierModel.findByIdAndDelete(id).exec();
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }
}
