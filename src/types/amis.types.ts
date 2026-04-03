/**
 * MISA AMIS Types
 * Type definitions cho MISA AMIS API kết nối
 */

/**
 * Request kết nối với AMIS
 */
export interface AmisConnectRequest {
    app_id: string;              // Mã ứng dụng MISA cung cấp
    access_code: string;         // Mã kết nối của công ty
    org_company_code: string;    // Domain khách hàng
}

/**
 * Response kết nối từ AMIS
 */
export interface AmisConnectResponse {
    Success: boolean;
    ErrorCode: string | null;
    ErrorMessage: string;
    Data: string;  // JSON string chứa access_token và thông tin khác
}

/**
 * Data trong response (parse từ Data string)
 */
export interface AmisTokenData {
    access_token: string;
    tenant_code: string;
    app_name: string;
    expired_time: string;
    expired_time_ticks: number;
}

/**
 * Callback Data Type Enum
 */
export enum CallBackDataType {
    None = 0,              // Chưa xác định
    SaveVoucher = 1,       // Callback của hàm cất (save)
    DeleteVoucher = 2,     // Callback của hàm xóa (delete)
    UpdateDocumentRef = 4, // Cập nhật chứng từ (chỉ dùng cho ASP)
    UpdateTaxInfoASP = 5   // Cập nhật thông tin thuế (chỉ dùng cho ASP)
}

/**
 * Callback Input - AMIS gọi vào endpoint của đối tác
 */
export interface CallbackDataInput {
    success: boolean;           // Trạng thái: true thành công, false thất bại
    app_id: string;            // ID ứng dụng
    error_code: string;        // Mã lỗi
    error_message: string;     // Thông tin chi tiết lỗi
    signature: string;         // Chữ ký: SHA256HMAC(data, key=app_id)
    data_type: number;         // Loại dữ liệu trả về (CallBackDataType)
    org_company_code: string;  // Mã công ty phía dữ liệu nguồn
    data: string;              // Dữ liệu JSON string kết quả trả về
}

/**
 * Callback Output - Response trả về cho AMIS
 */
export interface CallbackDataOutput {
    Success: boolean;
    ErrorCode?: string;
    ErrorMessage: string;
    Data?: string;
}

/**
 * Callback Detail - Parse từ data string
 */
export interface CallbackDataDetail {
    org_refid: string;              // ID gốc của chứng từ
    success: boolean;               // Trạng thái: true thành công, false thất bại
    error_code: string | null;      // Mã lỗi
    error_message: string;          // Thông tin chi tiết lỗi
    session_id: string | null;      // ID phiên làm việc
    error_call_back_message: string | null; // Lỗi callback lần trước
    voucher_type: number | null;    // Loại chứng từ
}

/**
 * ========================================
 * CHỨNG TỪ BÁN HÀNG (SA_VOUCHER)
 * ========================================
 */

/**
 * Request gửi chứng từ bán hàng lên AMIS
 */
export interface SaveVoucherRequest {
    app_id: string;
    org_company_code: string;
    voucher: SaVoucher[];
}

/**
 * Response từ AMIS khi gửi chứng từ
 */
export interface SaveVoucherResponse {
    Success: boolean;
    ErrorMessage: string;
    Data?: string;
}

/**
 * Request kiểm tra callback history
 */
export interface CheckCallbackRequest {
    app_id: string;
    org_company_code: string;
}

/**
 * Response kiểm tra callback history
 */
export interface CheckCallbackResponse {
    Success: boolean;
    ErrorMessage: string;
    Data?: string;  // JSON string chứa danh sách callback
}

/**
 * Một vật tư/hàng hóa trả về từ get_dictionary
 */
export interface AmisInventoryItem {
    inventory_item_id?: string;
    inventory_item_code?: string;
    inventory_item_name?: string;
    unit_id?: string;
    unit_name?: string;
    tax_rate?: number;
    default_stock_id?: string;
    inactive?: boolean;
    [key: string]: any;
}

/**
 * Response từ get_dictionary sau khi đã normalize Data thành mảng
 */
export interface AmisInventoryItemsResponse {
    Success: boolean;
    ErrorCode?: string | null;
    ErrorMessage?: string | null;
    Data: AmisInventoryItem[];
}

/**
 * Chi tiết chứng từ bán hàng (sa_voucher)
 */
export interface SaVoucherDetail {
    inventory_item_id?: string;           // ID hàng hóa
    inventory_item_code: string;          // Mã vật tư/hàng hóa
    inventory_item_name: string;          // Tên vật tư/hàng hóa
    description: string;                  // Diễn giải
    inventory_item_type: number;          // 0:Vật tư, 1:Thành phẩm, 2:Dịch vụ, 3:Nguyên vật liệu
    stock_code: string;                   // Mã kho
    stock_id?: string;                    // ID kho
    stock_name: string;                   // Tên kho
    debit_account: string;                // TK nợ
    credit_account: string;               // TK có
    sale_account?: string;                // Tài khoản doanh thu
    unit_id?: string;                     // ID đơn vị tính
    unit_name: string;                    // Tên đơn vị tính
    main_unit_id?: string;                // ID đơn vị tính chính
    main_unit_name: string;               // Tên đơn vị tính chính
    main_unit_price: number;              // Đơn giá theo đơn vị tính chính
    main_quantity: number;                // Số lượng theo đơn vị tính chính
    quantity: number;                     // Số lượng
    unit_price: number;                   // Đơn giá
    unit_price_after_tax?: number;        // Đơn giá sau thuế
    unit_price_after_discount?: number;   // Đơn giá sau chiết khấu
    amount_oc: number;                    // Thành tiền nguyên tệ
    amount: number;                       // Thành tiền quy đổi
    discount_rate: number;                // Tỷ lệ chiết khấu
    discount_amount_oc: number;           // Tiền chiết khấu nguyên tệ
    discount_amount: number;              // Tiền chiết khấu quy đổi
    discount_account?: string;            // TK chiết khấu
    vat_description?: string;             // Diễn giải thuế
    vat_rate?: number;                    // Thuế suất: 0, 5, 8, 10, -1(KCT), -2(KKKNT), -3(KHAC)
    other_vat_rate?: number;              // Thuế suất khác (khi vat_rate = -3)
    vat_amount_oc: number;                // Tiền thuế nguyên tệ
    vat_amount: number;                   // Tiền thuế quy đổi
    vat_account?: string;                 // Tài khoản thuế
    is_description?: boolean;             // Là dòng diễn giải
    is_promotion?: boolean;               // Là hàng khuyến mãi
    main_convert_rate: number;            // Tỷ lệ chuyển đổi ra đơn vị tính chính
    sort_order: number;                   // Thứ tự
    exchange_rate_operator: string;       // Toán tử quy đổi: * hoặc /
    stock_account?: string;               // Tài khoản kho
    amount_after_tax?: number;            // Thành tiền sau thuế
    account_object_id?: string;           // ID đối tượng
    account_object_code?: string;         // Mã đối tượng
    account_object_name?: string;         // Tên đối tượng
    account_object_address?: string;      // Địa chỉ
}

/**
 * Thông tin hóa đơn (sa_invoice)
 * Khi include_invoice = 1, object này sẽ chứa thông tin hóa đơn
 */
export interface SaInvoice {
    account_object_address?: string;      // Địa chỉ khách hàng
    account_object_id?: string;           // ID khách hàng (GUID)
    account_object_code?: string;         // Mã khách hàng
    account_object_name?: string;         // Tên khách hàng
    account_object_tax_code?: string;     // Mã số thuế khách hàng
    branch_id?: string;                   // Mã chi nhánh
    buyer?: string;                       // Người mua hàng
    currency_id?: string;                 // Loại tiền
    discount_rate_voucher?: number;       // Tỷ lệ chiết khấu theo mặt hàng
    discount_type?: number;               // Loại chiết khấu (0,1,2,3)
    employee_code?: string;               // Mã nhân viên bán hàng
    employee_name?: string;               // Tên nhân viên
    exchange_rate?: number;               // Tỷ giá hối đoái
    inv_date?: string;                    // Ngày hóa đơn (DateTime) - required
    inv_no?: string;                      // Số hóa đơn (bắt buộc) - required
    inv_series?: string;                  // Ký hiệu hóa đơn (bắt buộc) - required
    inv_template_no?: string;             // Mẫu số hóa đơn (bắt buộc) - required
    inv_type_id?: number;                 // Loại hóa đơn (1-6) - required
    is_invoice_machine?: boolean;         // Là hóa đơn từ máy tính tiền
    payment_method?: string;              // Hình thức thanh toán
    reftype?: number;                     // Loại chứng từ (3560) - required
    total_sale_amount_oc?: number;        // Tổng tiền hàng nguyên tệ - required
    total_sale_amount?: number;           // Tổng tiền hàng quy đổi - required
    total_amount_oc?: number;             // Tổng tiền thanh toán nguyên tệ - required
    total_amount?: number;                // Tổng tiền thanh toán quy đổi - required
    total_discount_amount_oc?: number;    // Chiết khấu nguyên tệ - required
    total_discount_amount?: number;       // Chiết khấu quy đổi - required
    total_vat_amount_oc?: number;         // Thuế GTGT nguyên tệ - required
    total_vat_amount?: number;            // Thuế GTGT quy đổi - required
}

/**
 * Thông tin phiếu xuất kho (in_outward)
 * Khi is_sale_with_outward = true, object này sẽ chứa thông tin xuất kho
 */
export interface InOutward {
    account_object_address?: string;      // Địa chỉ/bộ phận
    account_object_id?: string;           // ID đối tượng (GUID)
    account_object_code?: string;         // Mã đối tượng
    account_object_name?: string;         // Tên đối tượng
    branch_id?: string;                   // Mã chi nhánh - required
    contact_name?: string;                // Tên người nhận/bộ phận/cửa
    employee_code?: string;               // Mã nhân viên
    employee_name?: string;               // Tên nhân viên
    in_reforder?: string;                 // Giờ nhập xuất kho - required
    inventory_posted_date?: string;       // Ngày ghi sổ kho
    journal_memo?: string;                // Lý do/về việc
    posted_date?: string;                 // Ngày hạch toán - required
    refdate?: string;                     // Ngày chứng từ - required
    reftype?: number;                     // Loại chứng từ (2020: Xuất kho bán hàng) - required
}

/**
 * Chứng từ bán hàng chính (sa_voucher)
 */
export interface SaVoucher {
    voucher_type: number;                 // 13 - Chứng từ bán hàng
    org_refid: string;                    // ID của chứng từ dữ liệu gốc (GUID tự tạo)
    org_refno: string;                    // Số chứng từ gốc
    org_reftype_name?: string;            // Tên loại chứng từ trên dữ liệu gốc
    branch_id: string;                    // Mã chi nhánh
    account_object_id?: string;           // ID đối tượng
    account_object_code?: string;         // Mã khách hàng
    account_object_name?: string;         // Tên khách hàng
    account_object_tax_code?: string;     // Mã số thuế
    account_object_address?: string;      // Địa chỉ
    currency_id?: string;                 // Mã đồng tiền (VND, USD,...)
    exchange_rate?: number;               // Tỉ giá hối đoái (Mặc định = 1)
    discount_rate_voucher?: number;       // Tỷ lệ chiết khấu theo mặt hàng
    discount_type?: number;               // Loại chiết khấu: 0,1,2,3
    employee_id?: string;                 // Id Nhân viên
    employee_code?: string;               // Mã NV bán hàng
    employee_name?: string;               // Tên nhân viên
    include_invoice?: number;             // Có đính kèm hóa đơn: 0,1,2
    sa_invoice?: SaInvoice;               // ✅ Thông tin hóa đơn (khi include_invoice = 1)
    in_outward?: InOutward;               // ✅ Thông tin phiếu xuất kho (khi is_sale_with_outward = true)
    in_reforder?: string;                 // Giờ nhập xuất (DateTime)
    inv_date?: string;                    // Ngày hóa đơn (DateTime)
    inv_no?: string;                      // Số hóa đơn
    inv_series?: string;                  // Ký hiệu hóa đơn
    inv_template_no?: string;             // Mẫu số hóa đơn
    is_invoice_exported?: boolean;        // Đã xuất hóa đơn
    is_posted_finance?: boolean;          // Đánh dấu ghi sổ quản trị
    inv_type_id?: number;                 // Loại hóa đơn: 0,1,2,3,4,5,6
    is_sale_with_outward: boolean;        // Bán hàng kiêm phiếu xuất kho
    journal_memo?: string;                // Diễn giải
    outward_exported_status?: number;     // Đã xuất hàng: 0,1,2,3
    payer?: string;                       // Người nộp
    posted_date: string;                  // Ngày hạch toán (DateTime)
    due_date?: string;                    // Hạn thanh toán (DateTime)
    due_day?: string;                     // Số ngày được nợ
    refdate: string;                      // Ngày chứng từ (DateTime)
    refno_finance?: number;               // Số chứng từ bán hàng
    reftype: number;                      // Loại chứng từ: 3530,3531,3532,...
    reftype_name?: string;                // Tên loại chứng từ
    shipping_address?: string;            // Địa điểm giao hàng
    supplier_name?: string;               // Tên nhà cung cấp
    total_sale_amount_oc: number;         // Tổng tiền hàng nguyên tệ
    total_sale_amount: number;            // Tổng tiền hàng quy đổi
    total_amount_oc: number;              // Tổng tiền thanh toán nguyên tệ
    total_amount: number;                 // Tổng tiền thanh toán quy đổi
    total_discount_amount_oc: number;     // Chiết khấu nguyên tệ
    total_discount_amount: number;        // Chiết khấu quy đổi
    total_vat_amount_oc: number;          // Thuế GTGT nguyên tệ
    total_vat_amount: number;             // Thuế GTGT quy đổi
    custom_field1?: string;               // Trường mở rộng 1-10
    detail: SaVoucherDetail[];            // Chi tiết chứng từ
}
