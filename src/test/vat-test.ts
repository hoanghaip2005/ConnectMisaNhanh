/**
 * Test case để kiểm tra logic thuế VAT
 * - Mã hàng CK100210: 5% VAT
 * - Mã hàng khác: 8% VAT
 */

import AmisMapperService from '../services/amis-mapper.services';

// Test data: Bill giả lập với 3 sản phẩm
const mockBill = {
    id: 999999,
    type: 2, // Bán lẻ
    customer: {
        name: 'Khách hàng test'
    },
    products: [
        {
            code: 'CK100210',
            name: 'Sản phẩm thuế 5%',
            quantity: 1,
            amount: 105000  // Đã bao gồm VAT 5%: 100,000 + 5,000 = 105,000
        },
        {
            code: 'SP001',
            name: 'Sản phẩm thuế 8% (1)',
            quantity: 2,
            amount: 216000  // Đã bao gồm VAT 8%: 200,000 + 16,000 = 216,000
        },
        {
            code: 'SP002',
            name: 'Sản phẩm thuế 8% (2)',
            quantity: 1,
            amount: 54000   // Đã bao gồm VAT 8%: 50,000 + 4,000 = 54,000
        }
    ]
};

console.log('='.repeat(80));
console.log('TEST CASE: Kiểm tra thuế VAT');
console.log('='.repeat(80));

const voucher = AmisMapperService.mapRetailBillToAmisVoucher(mockBill);

console.log('\n📦 Chi tiết sản phẩm:\n');

voucher.detail?.forEach((detail: any, index: number) => {
    const product = mockBill.products[index];
    console.log(`${index + 1}. ${detail.inventory_item_code} - ${detail.inventory_item_name}`);
    console.log(`   Số lượng: ${detail.quantity}`);
    console.log(`   Tổng tiền (có VAT): ${product.amount.toLocaleString('vi-VN')} VND`);
    console.log(`   Tiền hàng (chưa VAT): ${detail.amount_oc.toLocaleString('vi-VN')} VND`);
    console.log(`   Thuế VAT: ${detail.vat_rate}%`);
    console.log(`   Tiền thuế: ${detail.vat_amount_oc.toLocaleString('vi-VN')} VND`);
    console.log(`   ✓ Kiểm tra: ${product.amount.toFixed(2)} = ${(detail.amount_oc + detail.vat_amount_oc).toFixed(2)}`);
    console.log('');
});

console.log('📊 Tổng hợp:');
console.log(`   Tổng tiền hàng: ${voucher.total_sale_amount_oc?.toLocaleString('vi-VN')} VND`);
console.log(`   Tổng thuế VAT: ${voucher.total_vat_amount_oc?.toLocaleString('vi-VN')} VND`);
console.log(`   Tổng thanh toán: ${voucher.total_amount_oc?.toLocaleString('vi-VN')} VND`);

console.log('\n' + '='.repeat(80));
console.log('✅ TEST HOÀN TẤT');
console.log('='.repeat(80));
