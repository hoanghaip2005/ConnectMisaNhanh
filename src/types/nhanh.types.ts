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
