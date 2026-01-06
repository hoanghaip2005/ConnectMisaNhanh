# Hướng dẫn tích hợp Nhanh.vn OAuth

## Cấu hình trên open.nhanh.vn

ngrok http --url=activ.ngrok.dev 3000

1. Truy cập https://open.nhanh.vn và tạo ứng dụng
2. Cấu hình Redirect URLs (phải là HTTPS):
   - Ví dụ: `https://yourdomain.com/api/nhanh/oauth/callback`
   - Có thể thêm nhiều URLs
3. Lưu lại `appId` và `secretKey` từ trang chi tiết ứng dụng

## Cài đặt

```bash
# Clone repository và cài đặt dependencies
npm install

# Cài đặt types cho cors nếu chưa có
npm install --save-dev @types/cors

# Copy file .env.example thành .env và điền thông tin
cp .env.example .env
```

## Cấu hình môi trường (.env)

```env
NHANH_APP_ID=76397              # App ID từ open.nhanh.vn
NHANH_SECRET_KEY=your_secret_key # Secret Key từ open.nhanh.vn
NHANH_API_VERSION=3.0
NHANH_BASE_URL=https://pos.open.nhanh.vn
NHANH_OAUTH_URL=https://nhanh.vn/oauth
```

## Chạy ứng dụng

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Luồng OAuth (3 bước)

### Bước 1: Khởi tạo OAuth - Lấy URL xác thực

**Endpoint**: `GET /api/nhanh/oauth/initiate`

**Query Parameters**:

- `returnUrl`: URL callback (HTTPS) để nhận accessCode

**Ví dụ request**:

```bash
curl "http://localhost:3000/api/nhanh/oauth/initiate?returnUrl=https://yourdomain.com/api/nhanh/oauth/callback"
```

**Response**:

```json
{
  "success": true,
  "data": {
    "oauthUrl": "https://nhanh.vn/oauth?version=3.0&appId=76397&returnLink=...",
    "message": "Redirect user to this URL to authorize the application"
  }
}
```

**Hành động**: Redirect người dùng đến `oauthUrl` để họ cấp quyền

### Bước 2: Người dùng cấp quyền

1. Người dùng đăng nhập vào Nhanh.vn
2. Chọn các quyền muốn cấp (sản phẩm, đơn hàng, v.v.)
3. Click "Đồng ý"
4. Nhanh.vn redirect về `returnUrl?accessCode=XXX`

### Bước 3: Đổi accessCode lấy accessToken

**Endpoint**: `GET /api/nhanh/oauth/callback`

**Query Parameters**:

- `accessCode`: Code nhận được từ Nhanh.vn (hết hạn sau 10 phút)

**Ví dụ request**:

```bash
curl "http://localhost:3000/api/nhanh/oauth/callback?accessCode=YOUR_ACCESS_CODE"
```

**Response**:

```json
{
  "success": true,
  "data": {
    "accessToken": "128-256_character_token",
    "businessId": 110668,
    "expiredAt": 1785603599,
    "expiryDate": "2026-06-30T23:59:59.000Z",
    "permissions": ["product", "order"],
    "depotIds": [],
    "pageIds": [],
    "version": "3.0"
  },
  "message": "Access token retrieved successfully"
}
```

**Lưu ý quan trọng**:

- `accessToken` có hạn 1 năm
- Chỉ duy trì 1 token cho mỗi `appId + businessId`
- Token mới được tạo → token cũ chỉ còn hiệu lực 15 phút
- Lưu trữ `accessToken` và `businessId` để sử dụng cho các API calls

## Kiểm tra token

**Endpoint**: `POST /api/nhanh/oauth/check`

**Body**:

```json
{
  "accessToken": "your_access_token",
  "businessId": 110668
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "valid": true,
    "businessId": 110668,
    "expiredAt": 1785603599,
    "expiryDate": "2026-06-30T23:59:59.000Z",
    "daysRemaining": 365,
    "permissions": ["product", "order"],
    "depotIds": [],
    "pageIds": []
  },
  "message": "Access token is valid. Expires in 365 days"
}
```

## API Endpoints khác

### Kiểm tra cấu hình

```bash
GET /api/nhanh/config
```

### Health check

```bash
GET /api/health
```

## Cấu trúc dự án

```
src/
├── controllers/
│   └── nhanh.controllers.ts  # Controller xử lý OAuth requests
├── services/
│   └── nhanh.services.ts      # Service gọi Nhanh API
├── routes/
│   ├── api.routes.ts          # Main API routes
│   └── nhanh.routes.ts        # Nhanh OAuth routes
├── types/
│   └── nhanh.types.ts         # TypeScript interfaces
└── server.ts                   # Express server setup
```

## Bảo mật

- ❌ **KHÔNG** commit file `.env` vào git
- ✅ Chỉ sử dụng HTTPS cho production
- ✅ Lưu trữ `accessToken` an toàn (database encrypted)
- ✅ Validate và sanitize mọi input
- ✅ Sử dụng helmet và cors middleware

## URL để cấu hình trên open.nhanh.vn

Sau khi deploy lên server, cung cấp URL callback này:

```
https://yourdomain.com/api/nhanh/oauth/callback
```

## Lưu ý quan trọng

1. **AccessCode**: Chỉ có hạn 10 phút và chỉ dùng 1 lần
2. **AccessToken**: Có hạn 1 năm, cần refresh trước khi hết hạn
3. **Permissions**: Token chỉ có quyền mà người dùng đã cấp
4. **DepotIds/PageIds**: Rỗng hoặc "All" = thao tác được toàn bộ
5. **Version**: Chỉ hỗ trợ API version 3.0

## Troubleshooting

### Lỗi "Invalid accessToken"

- Kiểm tra token có hết hạn không
- Đảm bảo đang dùng đúng businessId
- Token cũ có thể đã bị vô hiệu do tạo token mới

### Lỗi "Return link must use HTTPS"

- Redirect URL phải dùng HTTPS trên production
- Chỉ dùng HTTP cho localhost development

### Lỗi "Missing required configuration"

- Kiểm tra file .env có đầy đủ `NHANH_APP_ID` và `NHANH_SECRET_KEY`
- Restart server sau khi thay đổi .env
