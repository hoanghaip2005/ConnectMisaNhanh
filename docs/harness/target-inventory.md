# Harness Target Inventory

Bang nay ghi lai cac target nen viet harness theo thu tu uu tien. Uu tien cao nhat la cac ham co business logic nhieu, nhan input phuc tap, va co the chay offline.

## Uu tien 1: pure/offline business logic

| Target | File | Ly do | Kieu harness de xuat |
|---|---|---|---|
| `TransformService.transformOrderToRows` | `src/services/transform.services.ts` | Chuyen payload order thanh nhieu dong tinh doanh thu/chiet khau/don gia | Unit/property harness voi order builder |
| `TransformService.transformOrders` | `src/services/transform.services.ts` | Gop nhieu order, de co loi khi input rong/thieu field | Unit harness voi mang order bien doi |
| `TransformService.exportToCSV` | `src/services/transform.services.ts` | Tao TSV/CSV tu rows, de gap loi field co tab/newline | Unit/property harness voi row builder |
| `AmisMapperService.mapToAmisVoucher` | `src/services/amis-mapper.services.ts` | Map transformed rows sang voucher AMIS va tinh tong tien/VAT | Unit/property harness voi fake time/random/env |
| `AmisMapperService.mapRetailBillToAmisVoucher` | `src/services/amis-mapper.services.ts` | Nhan `any`, map bill sang voucher; rui ro cao voi payload thieu field | Unit/property harness voi bill builder va malformed payload |
| `AmisService.generateSHA256HMAC` | `src/services/amis.services.ts` | Ham chu ky thuan, security-sensitive | Unit harness voi vector co dinh |
| `AmisService.validateCallbackSignature` | `src/services/amis.services.ts` | Bao ve callback AMIS, phu thuoc `appId` tu env/constructor | Unit harness voi app id fake |
| `NhanhService.getOAuthUrl` | `src/services/nhanh.services.ts` | Validate HTTPS va encode return URL | Unit harness voi URL hop le/khong hop le |

## Uu tien 2: controller va route behavior co mock I/O

| Target | File | Ly do | Kieu harness de xuat |
|---|---|---|---|
| `NhanhController.initiateOAuth` | `src/controllers/nhanh.controllers.ts` | Validate query `returnUrl`; khong can network neu stub service | Controller harness voi mock request/response |
| `NhanhController.getOrderList` | `src/controllers/nhanh.controllers.ts` | Tinh thong ke status, sale channel, revenue tu response | Controller harness voi fake `nhanhService.getOrderList` |
| `WebhookController.handleWebhook` | `src/controllers/webhook.controller.ts` | Phai tra response ngay, verify signature, enqueue background | Endpoint/controller harness voi fake services va fake `setImmediate` |
| `handleAmisCallback` | `src/controllers/amis.controllers.ts` | Validate signature, tra output AMIS, xu ly async | Controller harness voi fake `amisService` va fake `setImmediate` |
| `saveVoucher` / `deleteVoucher` | `src/controllers/amis.controllers.ts` | Validate body va token fallback | Controller harness voi fake token manager/service |

## Uu tien 3: integration harness co server/app factory

Hien tai `src/server.ts` goi `app.listen` va `amisTokenManager.startAutoRefresh()` khi import. Vi vay chua nen viet Supertest-style integration harness truc tiep qua `server.ts`.

Neu can integration harness sau nay, nen refactor nho:

1. Tao ham `createApp()` cau hinh middleware va routes nhung khong listen.
2. De `server.ts` chi goi `createApp().listen(...)` va start token refresh khi chay runtime.
3. Harness import `createApp()` va mock service layer.

## Edge cases can dua vao corpus/fixtures

### Order transform

- `products` rong.
- `products` co nhieu item.
- `shippingAddress.name` la ten khach an danh: `khach le`, `khach shopee`, hoac bien the co khoang trang.
- `quantity = 0`, `quantity < 0`, `price = 0`, `discount > price * quantity`.
- `createdAt = 0`, timestamp qua khu, timestamp tuong lai, timestamp khong phai so.
- Ten san pham co tab, newline, dau phay, dau ngoac kep, Unicode.

### AMIS mapper

- `data` rong phai throw loi co y nghia.
- Row co `productQuantity = 0` khong duoc tao `Infinity` hoac `NaN`.
- `totalAfterDiscount`, `unitPriceAfterTax`, `productPrice` am hoac rat lon.
- Nhieu dong san pham phai co `sort_order` lien tiep.
- Tong `total_sale_amount`, `total_vat_amount`, `total_amount` phai khop voi tong detail trong nguong lam tron duoc chap nhan.

### Retail bill mapper

- `bill` null/undefined.
- `products` thieu, khong phai mang, hoac rong.
- Product thieu `amount`, `quantity`, `name`.
- `customer` thieu hoac `customer.name` rong.
- `amount` da bao gom VAT, can chia 1.08; khong duoc sinh `NaN` neu input khong hop le ma harness muon validate boundary.

### Webhook/callback

- Thieu signature khi secret khong bat buoc.
- Signature sai do length khac nhau.
- Payload order co `data.info.id`, `data.orderId`, `data.id`, `req.body.orderId`.
- Event khong ho tro phai skip background processing.
- `paymentReceived` thieu bill id phai log va khong goi AMIS.

## Invariants nen assert

- Transform row count bang tong so product hop le.
- Tat ca money fields trong output la finite number.
- `unitPriceAfterTax` khong vuot qua cong thuc discount cap 50% neu input hop le.
- Voucher detail count bang so row/product dau vao.
- `total_amount` xap xi `total_sale_amount + total_vat_amount`.
- Chu ky HMAC voi cung input/key luon sinh cung output lowercase hex.
- Webhook endpoint tra response truoc khi background I/O duoc resolve.

