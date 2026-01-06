import { SaVoucher, SaVoucherDetail } from '../types/amis.types';

/**
 * Service chuyển đổi dữ liệu transform sang AMIS voucher
 */

interface TransformedOrderRow {
    orderId: number;
    createdAt: string;
    customerName: string;
    customerNameAndId: string;
    productCode: string;
    productName: string;
    productBarcode: string;
    productQuantity: number;
    productPrice: number;
    productDiscount: number;
    totalBeforeDiscount: number;
    discountPercent: number;
    totalAfterDiscount: number;
    unitPriceAfterTax: number;
    checkMV: string;
    checkTSP: string;
}

interface TransformedOrder {
    orderId: number;
    data: TransformedOrderRow[];
}

export class AmisMapperService {
    private branchId: string;

    constructor() {
        this.branchId = process.env.MISA_BRANCH_ID || '5fd67820-387e-4078-b313-ac3718cd6e14';
    }

    /**
     * Chuyển đổi transformed order sang AMIS voucher
     * @param transformedOrder - Order đã transform từ Nhanh.vn
     * @param invNo - Số hóa đơn (optional)
     */
    public mapToAmisVoucher(transformedOrder: TransformedOrder, invNo?: string): SaVoucher {
        const { orderId, data } = transformedOrder;

        if (!data || data.length === 0) {
            throw new Error('No product data to map');
        }

        const firstRow = data[0];

        // Tính tổng tiền
        let totalSaleAmount = 0;      // Tổng tiền hàng (chưa thuế)
        let totalDiscountAmount = 0;  // Tổng chiết khấu
        let totalVatAmount = 0;       // Tổng thuế GTGT
        let totalAmount = 0;          // Tổng tiền thanh toán

        // Tính tổng từ từng sản phẩm
        data.forEach(row => {
            // Thành tiền = đơn giá * số lượng (chưa thuế)
            const amountBeforeVat = row.unitPriceAfterTax * row.productQuantity;
            // Thuế GTGT 8%
            const vatAmount = amountBeforeVat * 0.08;

            totalSaleAmount += amountBeforeVat;
            totalVatAmount += vatAmount;
        });

        // Tổng tiền thanh toán = tổng tiền hàng + VAT
        totalAmount = totalSaleAmount + totalVatAmount;

        // Tạo GUID cho org_refid
        const orgRefId = this.generateGuid();

        // Số hóa đơn (nếu có, nếu không dùng mã đơn hàng)
        const invoiceNo = invNo || `DH${orderId}`;

        // Tạo tên khách hàng: "Người mua không cung cấp thông tin - {orderId}"
        const accountObjectName = `Người mua không cung cấp thông tin - ${orderId}`;

        // Journal memo (diễn giải chung)
        const journalMemo = `Bán hàng Người mua không cung cấp thông tin - ${orderId} theo số hoá đơn số ${invoiceNo}`;

        // Thời gian hiện tại
        const currentDateTime = this.getCurrentDateTime();

        // Map chi tiết sản phẩm
        const details: SaVoucherDetail[] = data.map((row, index) => {
            // totalAfterDiscount từ Nhanh.vn đã bao gồm VAT, cần chia 1.08 để lấy giá trước VAT
            const amountBeforeVat = row.totalAfterDiscount / 1.08;
            // Đơn giá = thành tiền / số lượng
            const unitPrice = row.productQuantity > 0 ? amountBeforeVat / row.productQuantity : 0;
            // Thuế GTGT 8%
            const vatAmount = amountBeforeVat * 0.08;

            return {
                inventory_item_code: row.productCode,
                inventory_item_name: row.productName,
                description: row.productName,  // Description là tên hàng
                inventory_item_type: 2, // Dịch vụ
                stock_code: 'KHO01',
                stock_name: 'Kho chính',
                debit_account: '131',
                credit_account: '5111',
                unit_name: 'Cái',
                main_unit_name: 'Cái',
                main_unit_price: unitPrice,
                main_quantity: row.productQuantity,
                quantity: row.productQuantity,
                unit_price: unitPrice,
                amount_oc: amountBeforeVat,           // Thành tiền = đơn giá * số lượng
                amount: amountBeforeVat,              // Thành tiền quy đổi
                discount_rate: 0,                     // Không có chiết khấu
                discount_amount_oc: 0,                // Không có chiết khấu
                discount_amount: 0,                   // Không có chiết khấu
                vat_rate: 8,                          // Thuế GTGT 8%
                vat_amount_oc: vatAmount,             // Tiền thuế
                vat_amount: vatAmount,                // Tiền thuế quy đổi
                main_convert_rate: 1,
                sort_order: index + 1,
                exchange_rate_operator: '*'
            };
        });

        // Tạo voucher
        const voucher: SaVoucher = {
            voucher_type: 13,
            org_refid: orgRefId,
            org_refno: `DH${orderId}`,
            branch_id: this.branchId,
            account_object_code: 'KH00509',  // Mã khách hàng mặc định
            account_object_name: accountObjectName,
            payer: 'KHÁCH LẺ SHOPEE',  // Người liên hệ mặc định
            journal_memo: journalMemo,  // Diễn giải
            currency_id: 'VND',
            exchange_rate: 1,
            is_sale_with_outward: false,
            posted_date: currentDateTime,  // Thời gian lập chứng từ
            refdate: currentDateTime,      // Thời gian lập chứng từ
            reftype: 3530, // Bán hàng hóa, dịch vụ trong nước chưa thu tiền
            total_sale_amount_oc: totalSaleAmount,
            total_sale_amount: totalSaleAmount,
            total_amount_oc: totalAmount,
            total_amount: totalAmount,
            total_discount_amount_oc: totalDiscountAmount,
            total_discount_amount: totalDiscountAmount,
            total_vat_amount_oc: totalVatAmount,
            total_vat_amount: totalVatAmount,
            detail: details
        };

        return voucher;
    }

    /**
     * Chuyển đổi hoá đơn bán lẻ sang AMIS voucher
     * @param bill - Hoá đơn bán lẻ từ Nhanh.vn
     * @param invNo - Số hóa đơn (optional)
     */
    public mapRetailBillToAmisVoucher(bill: any, invNo?: string): SaVoucher {
        if (!bill || !bill.products || bill.products.length === 0) {
            throw new Error('No product data in retail bill');
        }

        const billId = bill.id;
        const customerName = bill.customer?.name || 'Khách lẻ';

        // Tính tổng tiền
        let totalSaleAmount = 0;
        let totalVatAmount = 0;
        let totalAmount = 0;

        // Map chi tiết sản phẩm
        const details: SaVoucherDetail[] = bill.products.map((product: any, index: number) => {
            // Tính tiền trước VAT từ amount (amount đã bao gồm VAT)
            const amountBeforeVat = product.amount / 1.08;
            const unitPrice = product.quantity > 0 ? amountBeforeVat / product.quantity : 0;
            const vatAmount = amountBeforeVat * 0.08;

            totalSaleAmount += amountBeforeVat;
            totalVatAmount += vatAmount;

            return {
                description: product.name,
                debit_account: '131',
                credit_account: '5111',
                unit_name: 'Cái',
                main_unit_name: 'Cái',
                main_unit_price: unitPrice,
                main_quantity: product.quantity,
                quantity: product.quantity,
                unit_price: unitPrice,
                amount_oc: amountBeforeVat,
                amount: amountBeforeVat,
                discount_rate: 0,
                discount_amount_oc: 0,
                discount_amount: 0,
                vat_rate: 8,
                vat_amount_oc: vatAmount,
                vat_amount: vatAmount,
                main_convert_rate: 1,
                sort_order: index + 1,
                exchange_rate_operator: '*'
            };
        });

        totalAmount = totalSaleAmount + totalVatAmount;

        const orgRefId = this.generateGuid();
        const invoiceNo = invNo || `HDB${billId}`;

        // Tên khách hàng: {tên từ hoá đơn} - {ID hoá đơn}
        const accountObjectName = `${customerName} - ${billId}`;

        // Diễn giải: Bán hàng {tên} - {ID hoá đơn} theo hóa đơn số {số hoá đơn}
        const journalMemo = `Bán hàng ${customerName} - ${billId} theo hóa đơn số ${invoiceNo}`;

        const currentDateTime = this.getCurrentDateTime();

        const voucher: SaVoucher = {
            voucher_type: 13,
            org_refid: orgRefId,
            org_refno: `HDB${billId}`,
            branch_id: this.branchId,
            account_object_code: 'KH000002',  // Mã khách hàng mặc định cho hoá đơn bán lẻ
            account_object_name: accountObjectName,
            payer: accountObjectName,  // Người liên hệ là tên khách hàng
            journal_memo: journalMemo,
            currency_id: 'VND',
            exchange_rate: 1,
            is_sale_with_outward: false,
            posted_date: currentDateTime,
            refdate: currentDateTime,
            reftype: 3530,
            total_sale_amount_oc: totalSaleAmount,
            total_sale_amount: totalSaleAmount,
            total_amount_oc: totalAmount,
            total_amount: totalAmount,
            total_discount_amount_oc: 0,
            total_discount_amount: 0,
            total_vat_amount_oc: totalVatAmount,
            total_vat_amount: totalVatAmount,
            detail: details
        };

        return voucher;
    }

    /**
     * Lấy datetime hiện tại theo format AMIS
     */
    private getCurrentDateTime(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    }

    /**
     * Format datetime từ "YYYY-MM-DD HH:mm:ss" sang "YYYY-MM-DDTHH:mm:ss"
     */
    private formatDateTime(dateTimeStr: string): string {
        // Input: "2025-12-25 14:55:27"
        // Output: "2025-12-25T14:55:27"
        return dateTimeStr.replace(' ', 'T');
    }

    /**
     * Generate GUID
     */
    private generateGuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

export default new AmisMapperService();
