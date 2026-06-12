# Project Structure

Tai lieu nay tom tat cau truc du an tai thoi diem tao bo harness docs. Muc dich la giup cac thay doi tiep theo biet nen doc file nao truoc, va nen tranh side effect nao khi viet harness.

## Cay thu muc chinh

```text
.
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- README.md
|-- DEPLOY_GUIDE.md
|-- .env.example
|-- src
|   |-- server.ts
|   |-- routes
|   |   |-- api.routes.ts
|   |   |-- nhanh.routes.ts
|   |   |-- webhook.routes.ts
|   |   |-- transform.routes.ts
|   |   |-- amis.routes.ts
|   |   `-- mapper.routes.ts
|   |-- controllers
|   |   |-- nhanh.controllers.ts
|   |   |-- webhook.controller.ts
|   |   |-- transform.controllers.ts
|   |   |-- amis.controllers.ts
|   |   `-- mapper.controllers.ts
|   |-- services
|   |   |-- nhanh.services.ts
|   |   |-- transform.services.ts
|   |   |-- amis.services.ts
|   |   |-- amis-mapper.services.ts
|   |   `-- amis-token-manager.services.ts
|   `-- types
|       |-- nhanh.types.ts
|       |-- amis.types.ts
|       `-- webhook.types.ts
`-- dist
```

## Lop ung dung

`src/server.ts`:

- Load `.env` bang `dotenv.config()`.
- Tao Express app, cai `helmet`, `cors`, JSON body parser, URL-encoded parser.
- Mount tat ca route duoi `/api`.
- Tao root endpoint `/`, 404 handler, error handler.
- Goi `app.listen(...)` va `amisTokenManager.startAutoRefresh()` ngay trong module.

Vi ly do do, harness khong nen import `src/server.ts` truc tiep neu muc tieu chi la test controller/router. Neu can endpoint harness sau nay, nen tach app factory truoc, vi import server hien tai co side effect khoi dong port va refresh token.

## Route map

Tat ca API chay qua `src/routes/api.routes.ts`:

| Prefix | Route file | Vai tro |
|---|---|---|
| `/api/nhanh` | `src/routes/nhanh.routes.ts` | OAuth, token check, order list, retail bill, process bill |
| `/api/webhooks` | `src/routes/webhook.routes.ts` | Webhook Nhanh.vn, status, health |
| `/api/transform` | `src/routes/transform.routes.ts` | Endpoint test transform va export CSV |
| `/api/amis` | `src/routes/amis.routes.ts` | AMIS connect, refresh token, callback, save/delete voucher |
| `/api/mapper` | `src/routes/mapper.routes.ts` | Endpoint test map order sang voucher AMIS |
| `/api/health` | `src/routes/api.routes.ts` | Health check chung |

## Luong du lieu quan trong

### Order Nhanh.vn sang AMIS

```text
Nhanh API/order payload
  -> NhanhController hoac WebhookController
  -> TransformService.transformSingleOrder/transformOrderToRows
  -> AmisMapperService.mapToAmisVoucher
  -> AmisService.saveVoucher
  -> AMIS API
```

Harness uu tien nen cat tai `TransformService` va `AmisMapperService` truoc, vi do la phan business logic co the chay offline.

### Retail bill sang AMIS

```text
Nhanh retail bill payload
  -> NhanhController.processRetailBill hoac WebhookController.handlePaymentReceived
  -> AmisMapperService.mapRetailBillToAmisVoucher
  -> AmisService.saveVoucher
  -> AMIS API
```

`mapRetailBillToAmisVoucher` nhan `any`, nen day la target tot cho harness dau vao bat thuong.

### Webhook Nhanh.vn

```text
POST /api/webhooks/nhanh
  -> verify x-nhanh-signature neu header ton tai
  -> tra HTTP 200 ngay
  -> setImmediate background task
  -> lay order/bill tu Nhanh
  -> transform/map
  -> save voucher len AMIS
```

Harness endpoint phai assert hai dieu rieng biet: response nhanh va background task duoc stub xu ly dung nhanh logic. Khong de harness goi API that.

### Callback AMIS

```text
POST /api/amis/callback
  -> validate signature bang HMAC(data, app_id)
  -> tra response theo CallbackDataOutput
  -> setImmediate process callback
```

Target chu ky HMAC co the test unit offline; target callback endpoint can fake `setImmediate` hoac cho no drain co kiem soat.

## Diem can than khi viet harness

- `src/services/amis-token-manager.services.ts` co ham ghi `.env`; khong dung tren `.env` that.
- `src/services/nhanh.services.ts` va `src/services/amis.services.ts` tao axios instance va goi network; harness phai mock axios hoac inject service fake.
- `src/services/amis-mapper.services.ts` dung `process.env.MISA_BRANCH_ID`, `new Date()`, va `Math.random()`; can stub de ket qua deterministic.
- `src/controllers/webhook.controller.ts` dung `setImmediate`; endpoint harness can chu dong flush callback hoac mock background services.
- README hien tai co dau hieu loi encoding tieng Viet; khi sua docs cu can can than de khong lam mat noi dung goc.

## Lenh hien co

| Lenh | Tinh trang |
|---|---|
| `npm run dev` | Chay `nodemon --exec ts-node src/server.ts` |
| `npm run build` | Chay TypeScript compiler |
| `npm start` | Chay `node dist/server.js` |
| `npm test` | Chua co test runner that, hien dang exit 1 |

