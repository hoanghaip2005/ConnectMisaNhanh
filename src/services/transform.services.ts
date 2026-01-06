/**
 * Transform Service
 * Chuyển đổi data từ Nhanh.vn sang format bảng phẳng
 */

interface NhanhOrder {
    info: {
        id: number;
        createdAt: number;
        status?: number;
    };
    shippingAddress: {
        name: string;
    };
    products: Array<{
        code: string;
        name: string;
        barcode: string;
        quantity: number;
        price: number;
        discount: number;
    }>;
    payment: {
        codAmount: number;
    };
}

interface FlattenedOrderRow {
    // Thông tin đơn hàng
    orderId: number;                        // ID đơn hàng từ info.id
    createdAt: string;                      // Ngày giờ tạo đơn từ info.createdAt

    // Thông tin khách hàng
    customerName: string;                   // Tên khách hàng từ shippingAddress.name (đã chuẩn hóa)
    customerNameAndId: string;              // Tên + ID khách hàng

    // Thông tin sản phẩm
    productCode: string;                    // Mã sản phẩm từ product.code
    productName: string;                    // Tên sản phẩm từ product.name
    productBarcode: string;                 // Mã vạch từ product.barcode
    productQuantity: number;                // Số lượng từ product.quantity

    // Thông tin giá
    productPrice: number;                   // Giá bán từ product.price
    productDiscount: number;                // Chiết khấu từ product.discount

    // Các cột tính toán
    totalBeforeDiscount: number;            // DTT = price * quantity
    discountPercent: number;                // PTCK = discount / DTT * 100
    totalAfterDiscount: number;             // Doanh thu sau chiết khấu
    unitPriceAfterTax: number;              // ĐG = (DTT - discount điều chỉnh) / quantity / 1.08

    // Cột check (để trống)
    checkMV: string;
    checkTSP: string;
}

export class TransformService {
    /**
     * Chuẩn hóa tên khách hàng
     * Nếu tên là "Khách lẻ", "Khách nước ngoài", "khách shopee" 
     * -> chuyển thành "Người mua không cung cấp thông tin"
     */
    private normalizeCustomerName(name: string): string {
        const lowerName = name.toLowerCase().trim();

        const anonymousNames = [
            'khách lẻ',
            'khách nước ngoài',
            'khách shopee',
            'khach le',
            'khach nuoc ngoai',
            'khach shopee'
        ];

        if (anonymousNames.includes(lowerName)) {
            return 'Người mua không cung cấp thông tin';
        }

        return name;
    }

    /**
     * Tính đơn giá sau xử lý chiết khấu 50%
     * Nếu chiết khấu > 50% -> giới hạn ở 50%
     * Công thức: DT sản phẩm sau chiết khấu / số lượng / 1.08
     */
    private calculateDonGia(giaBan: number, soLuong: number, chietKhau: number): number {
        // Tính doanh thu trước chiết khấu
        const dtt = giaBan * soLuong;

        // Tính phần trăm chiết khấu
        const ptck = dtt > 0 ? (chietKhau / dtt) : 0;

        // Giới hạn chiết khấu tối đa 50%
        let chietKhauDieuChinh = chietKhau;
        if (ptck > 0.5) {
            // Nếu chiết khấu > 50%, chỉ áp dụng 50%
            chietKhauDieuChinh = dtt * 0.5;
        }

        // Doanh thu sau chiết khấu (đã điều chỉnh)
        const doanhThuSauCK = dtt - chietKhauDieuChinh;

        // Đơn giá = Doanh thu sau CK / Số lượng / 1.08
        const donGia = soLuong > 0 ? (doanhThuSauCK / soLuong / 1.08) : 0;

        return Math.round(donGia * 100) / 100; // Làm tròn 2 chữ số thập phân
    }

    /**
     * Format timestamp thành ngày giờ đầy đủ
     */
    private formatDateTime(timestamp: number): string {
        if (!timestamp) return '';

        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Transform đơn hàng thành nhiều dòng (1 dòng/sản phẩm)
     */
    public transformOrderToRows(order: NhanhOrder): FlattenedOrderRow[] {
        const rows: FlattenedOrderRow[] = [];

        // Lấy tên khách hàng từ shippingAddress.name
        const customerName = this.normalizeCustomerName(order.shippingAddress.name);

        // Tên và ID = "Tên KH - ID đơn hàng"
        const customerNameAndId = `${customerName} - ${order.info.id}`;

        // Ngày tạo đơn với giờ phút giây từ createdAt timestamp
        const createdAt = this.formatDateTime(order.info.createdAt);

        // Duyệt qua từng sản phẩm trong đơn hàng
        order.products.forEach(product => {
            // Tính toán các giá trị
            const totalBeforeDiscount = product.price * product.quantity;
            const discountPercent = totalBeforeDiscount > 0 ? (product.discount / totalBeforeDiscount * 100) : 0;
            const totalAfterDiscount = totalBeforeDiscount - product.discount;
            const unitPriceAfterTax = this.calculateDonGia(
                product.price,
                product.quantity,
                product.discount
            );

            const row: FlattenedOrderRow = {
                // Thông tin đơn hàng
                orderId: order.info.id,
                createdAt: createdAt,

                // Thông tin khách hàng
                customerName: customerName,
                customerNameAndId: customerNameAndId,

                // Thông tin sản phẩm
                productCode: product.code,
                productName: product.name,
                productBarcode: product.barcode,
                productQuantity: product.quantity,

                // Thông tin giá
                productPrice: product.price,
                productDiscount: product.discount,

                // Các cột tính toán
                totalBeforeDiscount: Math.round(totalBeforeDiscount * 100) / 100,
                discountPercent: Math.round(discountPercent * 100) / 100,
                totalAfterDiscount: Math.round(totalAfterDiscount * 100) / 100,
                unitPriceAfterTax: unitPriceAfterTax,

                // Cột check
                checkMV: '',
                checkTSP: ''
            };

            rows.push(row);
        });

        return rows;
    }

    /**
     * Transform nhiều đơn hàng thành mảng các dòng
     */
    public transformOrders(orders: NhanhOrder[]): FlattenedOrderRow[] {
        const allRows: FlattenedOrderRow[] = [];

        orders.forEach(order => {
            const orderRows = this.transformOrderToRows(order);
            allRows.push(...orderRows);
        });

        return allRows;
    }

    /**
     * Transform một đơn hàng đơn lẻ (để dùng cho webhook)
     */
    public transformSingleOrder(order: NhanhOrder): FlattenedOrderRow[] {
        return this.transformOrderToRows(order);
    }

    /**
     * Export sang CSV format
     */
    public exportToCSV(rows: FlattenedOrderRow[]): string {
        const headers = [
            'Ngày',
            'ID',
            'Tên khách hàng',
            'Tên và ID',
            'Mã sản phẩm',
            'Tên sản phẩm',
            'Mã vạch',
            'Số lượng',
            'Giá bán',
            'DTT',
            'Chiết khấu',
            'PTCK',
            'Doanh thu sau chiết khấu',
            'Check MV',
            'Check TSP',
            'ĐG'
        ];

        let csv = headers.join('\t') + '\n';

        rows.forEach(row => {
            const values = [
                row.createdAt,
                row.orderId,
                row.customerName,
                row.customerNameAndId,
                row.productCode,
                row.productName,
                row.productBarcode,
                row.productQuantity,
                row.productPrice,
                row.totalBeforeDiscount,
                row.productDiscount,
                row.discountPercent + '%',
                row.totalAfterDiscount,
                row.checkMV,
                row.checkTSP,
                row.unitPriceAfterTax
            ];

            csv += values.join('\t') + '\n';
        });

        return csv;
    }
}

export default new TransformService();
