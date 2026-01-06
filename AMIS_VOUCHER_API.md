# AMIS Integration - Chứng từ bán hàng

## API Endpoints

### 1. Kết nối với AMIS (Lấy Access Token)

```bash
POST /api/amis/connect
```

**Response:**

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "tenant_code": "H6DLVSLM",
    "app_name": "CÔNG TY TNHH RUN DIRECT",
    "expired_time": "2025-12-26T11:43:55",
    "expired_time_ticks": 639023462352615600
  }
}
```

### 2. Gửi chứng từ bán hàng

```bash
POST /api/amis/save-voucher
Content-Type: application/json
```

**Body:**

```json
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "vouchers": [
    {
      "voucher_type": 13,
      "org_refid": "ORDER-672821543-001",
      "org_refno": "DH672821543",
      "branch_id": "YOUR_BRANCH_ID",
      "posted_date": "2024-12-25T00:00:00",
      "refdate": "2024-12-25T00:00:00",
      "reftype": 3530,
      "is_sale_with_outward": false,
      "total_sale_amount_oc": 3000000,
      "total_sale_amount": 3000000,
      "total_amount_oc": 3240000,
      "total_amount": 3240000,
      "total_discount_amount_oc": 0,
      "total_discount_amount": 0,
      "total_vat_amount_oc": 240000,
      "total_vat_amount": 240000,
      "detail": [...]
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "Success": true,
    "ErrorMessage": "",
    "Data": "Hệ thống đã ghi nhận yêu cầu đồng bộ..."
  }
}
```

### 3. Callback từ AMIS

```bash
POST /api/amis/callback
```

Endpoint này do AMIS gọi vào sau khi xử lý xong chứng từ.

## Luồng hoạt động

1. **Lấy Access Token**

   ```bash
   curl -X POST "https://activ.ngrok.dev/api/amis/connect"
   ```

2. **Gửi chứng từ bán hàng**

   ```bash
   curl -X POST "https://activ.ngrok.dev/api/amis/save-voucher" \
     -H "Content-Type: application/json" \
     -d @test-save-voucher.json
   ```

3. **AMIS xử lý bất đồng bộ**

   - AMIS nhận request, trả về ngay lập tức
   - AMIS xử lý chứng từ trong background

4. **AMIS gọi callback**
   - Sau khi xử lý xong, AMIS gọi vào `/api/amis/callback`
   - Trả về kết quả thành công/thất bại cho từng chứng từ

## Các trường quan trọng

### voucher_type

- `13`: Chứng từ bán hàng

### reftype (Loại chứng từ)

- `3530`: Bán hàng hóa, dịch vụ trong nước chưa thu tiền
- `3531`: Bán hàng hóa, dịch vụ trong nước - Tiền mặt
- `3537`: Bán hàng hóa, dịch vụ trong nước - Chuyển khoản

### inventory_item_type

- `0`: Vật tư hàng hóa
- `1`: Thành phẩm
- `2`: Dịch vụ
- `3`: Nguyên vật liệu

### vat_rate (Thuế suất)

- `0`: 0%
- `5`: 5%
- `8`: 8%
- `10`: 10%
- `-1`: Không chịu thuế (KCT)
- `-2`: Không kê khai nội thuế (KKKNT)
- `-3`: Khác (cần truyền other_vat_rate)

## Mã lỗi thường gặp

- `InvalidToken`: Token không hợp lệ → Lấy token mới
- `ExpiredToken`: Token hết hạn → Lấy token mới
- `InvalidParam`: Tham số không hợp lệ → Kiểm tra dữ liệu đầu vào
- `IsCreatedVoucher`: Đã sinh chứng từ → Không thể cập nhật
- `VoucherNotFound`: Không tìm thấy chứng từ → Kiểm tra org_refid

## Bảo mật

- Callback signature được validate bằng HMAC-SHA256
- Signature = SHA256HMAC(data, key=app_id)
- Request không hợp lệ sẽ bị từ chối với mã lỗi `InvalidParam`
