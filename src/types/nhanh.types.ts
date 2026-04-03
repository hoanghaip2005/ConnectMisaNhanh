/**
 * Nhanh.vn API Types and Interfaces
 */

export interface NhanhOAuthConfig {
    appId: string;
    secretKey: string;
    apiVersion: string;
    baseUrl: string;
    oauthUrl: string;
}

export interface AccessTokenRequest {
    accessCode: string;
    secretKey: string;
}

export interface AccessTokenResponse {
    code: number;
    data?: {
        accessToken: string;
        version: string;
        expiredAt: number;
        businessId: number;
        depotIds: number[] | string;
        pageIds: number[] | string;
        permissions: string[];
    };
    messages?: string[];
    errorCode?: string;
}

export interface CheckTokenRequest {
    secretKey: string;
}

export interface CheckTokenResponse {
    code: number;
    data?: {
        accessToken: string;
        version: string;
        expiredAt: number;
        businessId: number;
        depotIds: number[] | string;
        pageIds: number[] | string;
        permissions: string[];
    };
    messages?: string[];
    errorCode?: string;
}

export interface OAuthUrlParams {
    version: string;
    appId: string;
    returnLink: string;
}

export interface OrderListFilters {
    statuses?: number[];
    saleChannels?: number[];
    ids?: number[];
    fromDate?: number;
    toDate?: number;
    createdAtFrom?: number;
    createdAtTo?: number;
    updatedAtFrom?: number;
    updatedAtTo?: number;
    deliveryAtFrom?: number;
    deliveryAtTo?: number;
    id?: number;
    customerId?: number;
    customerPhone?: string;
}

export interface OrderListPaginator {
    size?: number;
    page?: number;
}

export interface OrderListRequest {
    filters?: OrderListFilters;
    paginator?: OrderListPaginator;
    dataOptions?: Record<string, any>;
}

export interface OrderListResponse {
    code: number;
    data?: any[];
    messages?: string[];
    errorCode?: string;
}

/**
 * Order History Request
 */
export interface OrderHistoryRequest {
    filters: {
        orderIds: number[];      // Mảng ID đơn hàng, tối đa 100
        type?: string;           // logcarrier: Load lịch sử đơn hàng từ hãng vận chuyển
        steps?: number[];        // Mảng hành động thao tác cần lọc (vd: [7] = Đổi trạng thái)
    };
}

/**
 * Order History Response
 */
export interface OrderHistoryResponse {
    code: number;
    paginator?: {
        next?: string;           // Giá trị để lấy dữ liệu trang tiếp theo
    };
    data?: OrderHistoryItem[];
    messages?: string[];
}

/**
 * Order History Item
 */
export interface OrderHistoryItem {
    orderId: number;             // ID đơn hàng trên Nhanh.vn
    step: number;                // ID hành động
    status: {
        old: number;             // ID trạng thái cũ
        new: number;             // ID trạng thái mới
    };
    createdAt: number;           // Thời gian tạo (định dạng timestamp)
    createdById: number;         // ID người thao tác
    createdBy: string;           // Người thao tác
}

/**
 * Retail Bill List Filters
 */
export interface RetailBillFilters {
    id?: number;                 // ID hóa đơn
    depotIds?: number[];         // Mảng ID kho
    type?: number;               // Loại xuất nhập kho: 1 = Nhập kho (Trả hàng), 2 = Xuất kho (Bán lẻ)
    orderIds?: number[];         // Mảng ID đơn hàng (tối đa 100)
    customerId?: number;         // ID khách hàng
    customerPhone?: string;      // Số điện thoại khách hàng (customerMobile trong API)
    fromDate?: string;           // Ngày xuất kho từ (yyyy-mm-dd)
    toDate?: string;             // Ngày xuất kho đến (yyyy-mm-dd)
    storeIds?: number[];         // Mảng ID cửa hàng (deprecated, dùng depotIds)
    status?: number[];           // Mảng trạng thái hóa đơn
}

/**
 * Retail Bill Paginator
 */
export interface RetailBillPaginator {
    size?: number;               // Số lượng bản ghi trả về (mặc định 50, tối đa 100)
    next?: {                     // Thông tin phân trang
        id?: number;             // ID của bản ghi cuối cùng trang trước
    };
}

/**
 * Retail Bill Request
 */
export interface RetailBillRequest {
    filters?: RetailBillFilters;
    paginator?: RetailBillPaginator;
    dataOptions?: Record<string, any>;
}

/**
 * Retail Bill Response
 */
export interface RetailBillResponse {
    code: number;
    data?: any[];
    paginator?: {
        next?: {
            id?: number;
        };
    };
    messages?: string[];
    errorCode?: string;
}
