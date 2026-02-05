import { SaVoucher, SaVoucherDetail } from '../types/amis.types';
import inventoryCache from './inventory-cache.services';
import logger from '../utils/logger';

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
     * @param saleChannel - Kênh bán hàng (42 = Shopee, khác = kênh khác)
     */
    public async mapToAmisVoucher(transformedOrder: TransformedOrder, invNo?: string, saleChannel?: number): Promise<SaVoucher> {
        const { orderId, data } = transformedOrder;

        if (!data || data.length === 0) {
            throw new Error('No product data to map');
        }

        const firstRow = data[0];

        // Kiểm tra tất cả mã vật tư từ Nhanh.vn có tồn tại trong MISA không
        const productCodes = data.map(row => row.productCode);
        const inventoryCheckResult = await inventoryCache.checkMultipleInventoryCodes(productCodes);
        
        // Log các mã không tồn tại
        productCodes.forEach(code => {
            const exists = inventoryCheckResult.get(code);
            if (!exists) {
                logger.warn(`Product code ${code} from Nhanh.vn not found in MISA AMIS, will use empty code`);
            } else {
                logger.info(`Product code ${code} found in MISA:`, {
                    id: exists.id,
                    name: exists.name
                });
            }
        });

        // Xác định mã khách hàng dựa vào kênh bán
        // Shopee (saleChannel = 42) → KH00509
        // Kênh khác → KH000002
        const accountObjectId = saleChannel === 42 ? '64745b34-914a-44db-88c7-d37fabcadefd' : 'c47e72a9-288d-4b7c-ba14-8aef0c046550';
        const accountObjectCode = saleChannel === 42 ? 'KH00509' : 'KH000002';
        const accountObjectType = saleChannel === 42 ? 'KHÁCH LẺ SHOPEE' : 'Khách lẻ';

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
        const invoiceNo = invNo || `BH${orderId}`;

        // Tạo tên khách hàng: "Người mua không cung cấp thông tin - {orderId}"
        const accountObjectName = `Người mua không cung cấp thông tin - ${orderId}`;

        // Journal memo (diễn giải chung)
        const journalMemo = `Bán hàng Người mua không cung cấp thông tin - ${orderId} theo số hoá đơn số ${invoiceNo}`;

        // Thời gian hiện tại
        const currentDateTime = this.getCurrentDateTime();

        // Map chi tiết sản phẩm
        const details: SaVoucherDetail[] = data.map((row, index) => {
            // Kiểm tra mã vật tư có tồn tại trong MISA không
            const inventoryExists = inventoryCheckResult.get(row.productCode);
            const finalProductCode = inventoryExists ? row.productCode : ''; // Để trống nếu không tồn tại
            
            if (!inventoryExists) {
                logger.warn(`Order ${orderId} - Product ${row.productCode} not found in MISA, using empty code`);
            }
            
            // Xác định thuế VAT dựa vào mã sản phẩm
            const vatRate = row.productCode === 'CK100210' ? 5 : 8;
            const vatDivisor = 1 + (vatRate / 100); // 1.05 hoặc 1.08
            
            // totalAfterDiscount từ Nhanh.vn đã bao gồm VAT
            const amountBeforeVat = row.totalAfterDiscount / vatDivisor;
            // Đơn giá = thành tiền / số lượng
            const unitPrice = row.productQuantity > 0 ? amountBeforeVat / row.productQuantity : 0;
            // Thuế GTGT
            const vatAmount = amountBeforeVat * (vatRate / 100);

            return {
                inventory_item_code: finalProductCode,  // Để trống nếu không tồn tại trong MISA
                inventory_item_name: row.productName,
                description: row.productName,  // Description là tên hàng
                inventory_item_type: 2, // Dịch vụ
                account_object_id: accountObjectId,
                account_object_code: accountObjectCode,
                stock_id: 'a84bf448-c6b4-4365-8a81-a403ae0a298a',
                stock_code: 'KCT001',
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
                vat_rate: vatRate,                    // Thuế GTGT: 5% hoặc 8%
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
            org_refno: `BH${orderId}`,
            branch_id: this.branchId,
            account_object_id: accountObjectId,      // ID khách hàng
            account_object_code: accountObjectCode,  // KH00509 (Shopee) hoặc KH000002 (khác)
            account_object_name: accountObjectName,
            payer: accountObjectType,  // "KHÁCH LẺ SHOPEE" hoặc "Khách lẻ"
            journal_memo: journalMemo,  // Diễn giải
            currency_id: 'VND',
            exchange_rate: 1,
            is_sale_with_outward: true,        // ✅ Xuất kho khi bán hàng
            include_invoice: 1,                // ✅ Bao gồm hóa đơn
            sa_invoice: {                      // ✅ Thông tin hóa đơn (copy từ voucher chính)
                account_object_id: accountObjectId,
                account_object_code: accountObjectCode,
                account_object_name: accountObjectName,
                branch_id: this.branchId,
                buyer: accountObjectType,      // Người mua hàng
                currency_id: 'VND',
                exchange_rate: 1,
                is_invoice_machine: true,
                reftype: 3560,                 // 3560: Hóa đơn bán hàng hóa, dịch vụ trong nước
                total_sale_amount_oc: totalSaleAmount,
                total_sale_amount: totalSaleAmount,
                total_amount_oc: totalAmount,
                total_amount: totalAmount,
                total_discount_amount_oc: totalDiscountAmount,
                total_discount_amount: totalDiscountAmount,
                total_vat_amount_oc: totalVatAmount,
                total_vat_amount: totalVatAmount
            },
            in_outward: {                      // ✅ Thông tin phiếu xuất kho (copy từ voucher chính)
                account_object_id: accountObjectId,
                account_object_code: accountObjectCode,
                account_object_name: accountObjectName,
                branch_id: this.branchId,
                contact_name: accountObjectType, // Người liên hệ
                journal_memo: journalMemo,
                posted_date: currentDateTime,
                refdate: currentDateTime,
                in_reforder: currentDateTime,  // Giờ nhập xuất kho
                reftype: 2020                  // 2020: Xuất kho bán hàng
            },
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
    public async mapRetailBillToAmisVoucher(bill: any, invNo?: string): Promise<SaVoucher> {
        if (!bill || !bill.products || bill.products.length === 0) {
            throw new Error('No product data in retail bill');
        }

        const billId = bill.id;
        const billType = bill.type; // 1 = Trả hàng, 2 = Xuất kho bán lẻ
        const customerName = bill.customer?.name || 'Khách lẻ';

        // Kiểm tra tất cả mã vật tư từ Nhanh.vn có tồn tại trong MISA không
        const productCodes = bill.products.map((p: any) => p.code);
        const inventoryCheckResult = await inventoryCache.checkMultipleInventoryCodes(productCodes);
        
        // Log các mã không tồn tại
        productCodes.forEach((code: string) => {
            const exists = inventoryCheckResult.get(code);
            if (!exists) {
                logger.warn(`Product code ${code} from retail bill ${billId} not found in MISA AMIS, will use empty code`);
            }
        });

        // Xác định voucher_type và prefix dựa vào bill.type
        // Type 1 (Trả hàng) -> voucher_type = 12 (Hàng bán bị trả lại)
        // Type 2 (Bán lẻ) -> voucher_type = 13 (Hóa đơn bán hàng)
        const voucherType = billType === 1 ? 12 : 13;
        const prefix = billType === 1 ? 'BTL' : 'BH'; // BTL = Trả hàng, BH = Hóa đơn bán

        // Tính tổng tiền
        let totalSaleAmount = 0;
        let totalVatAmount = 0;
        let totalAmount = 0;

        // Map chi tiết sản phẩm
        const details: SaVoucherDetail[] = bill.products.map((product: any, index: number) => {
            // Kiểm tra mã vật tư có tồn tại trong MISA không
            const inventoryExists = inventoryCheckResult.get(product.code);
            const finalProductCode = inventoryExists ? product.code : ''; // Để trống nếu không tồn tại
            
            if (!inventoryExists) {
                logger.warn(`Bill ${billId} - Product ${product.code} not found in MISA, using empty code`);
            }
            
            // Xác định thuế VAT dựa vào mã sản phẩm
            const vatRate = product.code === 'CK100210' ? 5 : 8;
            const vatDivisor = 1 + (vatRate / 100); // 1.05 hoặc 1.08
            
            // Tính tiền trước VAT từ amount (amount đã bao gồm VAT)
            const amountBeforeVat = product.amount / vatDivisor;
            const unitPrice = product.quantity > 0 ? amountBeforeVat / product.quantity : 0;
            const vatAmount = amountBeforeVat * (vatRate / 100);

            totalSaleAmount += amountBeforeVat;
            totalVatAmount += vatAmount;

            return {
                inventory_item_code: finalProductCode,    // Để trống nếu không tồn tại trong MISA
                inventory_item_name: product.name,        // ✅ Thêm tên hàng
                description: product.name,
                inventory_item_type: 2,                   // ✅ Loại hàng hóa: 2 = Dịch vụ
                account_object_id: 'c47e72a9-288d-4b7c-ba14-8aef0c046550',
                account_object_code: 'KH000002',
                debit_account: '131',
                credit_account: '5111',
                stock_id: 'a84bf448-c6b4-4365-8a81-a403ae0a298a',
                stock_code: 'KCT001',
                stock_name: 'Kho mặc định',              // ✅ Tên kho
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
                vat_rate: vatRate,              // Thuế GTGT: 5% hoặc 8%
                vat_amount_oc: vatAmount,       // Tiền thuế
                vat_amount: vatAmount,          // Tiền thuế quy đổi
                main_convert_rate: 1,
                sort_order: index + 1,
                exchange_rate_operator: '*'
            };
        });

        totalAmount = totalSaleAmount + totalVatAmount;

        const orgRefId = this.generateGuid();
        const invoiceNo = invNo || `${prefix}${billId}`;

        // Tên khách hàng: {tên từ hoá đơn} - {ID hoá đơn}
        const accountObjectName = `${customerName} - ${billId}`;

        // Diễn giải theo loại bill
        const action = billType === 1 ? 'Trả hàng' : 'Bán hàng';
        const journalMemo = `${action} ${customerName} - ${billId} theo hóa đơn số ${invoiceNo}`;

        const currentDateTime = this.getCurrentDateTime();

        // Xác định các giá trị dựa vào billType
        const isSaleWithOutward = billType === 2; // true cho bán hàng (xuất kho), false cho trả hàng (nhập kho)
        const includeInvoice = billType === 2 ? 1 : 0; // Chỉ bao gồm hóa đơn khi bán hàng
        const inOutwardReftype = billType === 2 ? 2020 : 2010; // 2020: Xuất kho bán hàng, 2010: Nhập kho trả hàng
        const voucherReftype = billType === 2 ? 3530 : 3520; // 3530: Bán hàng chưa thu tiền, 3520: Trả hàng

        const voucher: SaVoucher = {
            voucher_type: voucherType,
            org_refid: orgRefId,
            org_refno: invoiceNo,
            branch_id: this.branchId,
            account_object_id: 'c47e72a9-288d-4b7c-ba14-8aef0c046550',  // ID khách hàng KH000002
            account_object_code: 'KH000002',  // Mã khách hàng mặc định cho hoá đơn bán lẻ
            account_object_name: accountObjectName,
            payer: accountObjectName,  // Người liên hệ là tên khách hàng
            journal_memo: journalMemo,
            currency_id: 'VND',
            exchange_rate: 1,
            is_sale_with_outward: isSaleWithOutward,   // ✅ true: Xuất kho (bán hàng), false: Nhập kho (trả hàng)
            include_invoice: includeInvoice,           // ✅ 1: Bao gồm hóa đơn (bán hàng), 0: Không có (trả hàng)
            sa_invoice: billType === 2 ? {             // ✅ Chỉ có sa_invoice khi bán hàng
                account_object_id: 'c47e72a9-288d-4b7c-ba14-8aef0c046550',
                account_object_code: 'KH000002',
                account_object_name: accountObjectName,
                branch_id: this.branchId,
                buyer: accountObjectName,      // Người mua hàng
                currency_id: 'VND',
                exchange_rate: 1,
                is_invoice_machine: true,
                reftype: 3560,                 // 3560: Hóa đơn bán hàng hóa, dịch vụ trong nước
                total_sale_amount_oc: totalSaleAmount,
                total_sale_amount: totalSaleAmount,
                total_amount_oc: totalAmount,
                total_amount: totalAmount,
                total_discount_amount_oc: 0,
                total_discount_amount: 0,
                total_vat_amount_oc: totalVatAmount,
                total_vat_amount: totalVatAmount
            } : undefined,
            in_outward: {                              // ✅ Thông tin phiếu xuất/nhập kho
                account_object_id: 'c47e72a9-288d-4b7c-ba14-8aef0c046550',
                account_object_code: 'KH000002',
                account_object_name: accountObjectName,
                branch_id: this.branchId,
                contact_name: accountObjectName, // Người liên hệ
                journal_memo: journalMemo,
                posted_date: currentDateTime,
                refdate: currentDateTime,
                in_reforder: currentDateTime,  // Giờ nhập xuất kho
                reftype: inOutwardReftype      // 2020: Xuất kho bán hàng, 2010: Nhập kho trả hàng
            },
            posted_date: currentDateTime,
            refdate: currentDateTime,
            reftype: voucherReftype,           // 3530: Bán hàng chưa thu tiền, 3520: Trả hàng
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
