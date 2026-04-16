import { Injectable } from '@nestjs/common';

export interface PricingInput {
  net_weight: number;
  stone_weight: number;
  /** Rate per gram for the product's metal type — derived from Settings.metal_rates */
  metal_rate: number;
  /** Rate per gram/carat for the product's stone type — derived from Settings.stone_rates */
  stone_rate: number;
  making_charge_type: string;
  making_charge_rate: number;
  fixed_making_charge: number;
  tax_percentage: number;
  discount_percentage?: number;
  price_override?: number | null;
}

export interface PricingResult {
  metal_price: number;
  making_charges: number;
  stone_price: number;
  discount_amount: number;
  tax_amount: number;
  final_price: number;
  is_override: boolean;
}

@Injectable()
export class PricingService {
  calculate(input: PricingInput): PricingResult {
    const stone_price = parseFloat(
      (input.stone_weight * input.stone_rate).toFixed(2),
    );

    if (input.price_override != null && input.price_override > 0) {
      return {
        metal_price: 0,
        making_charges: 0,
        stone_price,
        discount_amount: 0,
        tax_amount: 0,
        final_price: input.price_override,
        is_override: true,
      };
    }

    const metal_price = parseFloat(
      (input.net_weight * input.metal_rate).toFixed(2),
    );

    const making_charges = parseFloat(
      (input.making_charge_type === 'per_gram'
        ? input.net_weight * input.making_charge_rate
        : input.fixed_making_charge
      ).toFixed(2),
    );

    const subtotal = metal_price + making_charges + stone_price;
    const discount_amount = parseFloat(
      ((subtotal * (input.discount_percentage || 0)) / 100).toFixed(2),
    );
    const taxable_amount = subtotal - discount_amount;

    const tax_amount = parseFloat(
      ((taxable_amount * input.tax_percentage) / 100).toFixed(2),
    );
    const final_price = parseFloat((taxable_amount + tax_amount).toFixed(2));

    return {
      metal_price,
      making_charges,
      stone_price,
      discount_amount,
      tax_amount,
      final_price,
      is_override: false,
    };
  }
}
