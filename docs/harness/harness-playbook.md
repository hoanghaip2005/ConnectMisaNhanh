# Harness Playbook

Playbook nay mo ta cach nen viet harness cho repo TypeScript/Express nay. No chua them test runner hay dependency; no la tai lieu thao tac truoc khi implement.

## Trang thai hien tai

- `npm run build` la lenh verify chinh hien co.
- `npm test` chua san sang vi script hien tai la placeholder exit 1.
- Chua co thu muc `test/`, `tests/`, `__tests__/`, hay fixture chinh thuc.
- Cac service network dung Axios truc tiep.
- `server.ts` co side effect khi import.

## Thu tu implement harness de xuat

1. Them test runner cho TypeScript.
2. Tao fixtures/builders cho Nhanh order, transformed row, retail bill, AMIS callback.
3. Viet unit harness cho `TransformService`.
4. Viet unit harness cho `AmisMapperService` voi fake time/random.
5. Viet harness chu ky HMAC cho `AmisService`.
6. Chi sau do moi viet controller/route harness voi mock service.
7. Neu can endpoint integration, tach app factory truoc khi dung server Express trong test.

## Test runner goi y

Neu duoc phep them dependency sau nay, lua chon phu hop cho repo nay:

- `vitest` cho unit/controller tests nhanh voi TypeScript.
- `fast-check` cho property-based/fuzz-style tests trong Node.
- `supertest` cho endpoint harness sau khi tach `createApp()`.

Khong can them tat ca ngay tu dau. Duong di gon nhat la `vitest` truoc, sau do them `fast-check` cho cac ham transform/map co input phuc tap.

## Mau cau truc thu muc khi bat dau implement

```text
test
|-- fixtures
|   |-- nhanh-order.fixture.ts
|   |-- transformed-row.fixture.ts
|   |-- retail-bill.fixture.ts
|   `-- amis-callback.fixture.ts
|-- harness
|   |-- transform.service.spec.ts
|   |-- amis-mapper.service.spec.ts
|   |-- amis-signature.spec.ts
|   `-- webhook.controller.spec.ts
`-- helpers
    |-- env.ts
    |-- fake-response.ts
    `-- flush-immediate.ts
```

## Isolation rules

### Environment

Dung helper snapshot env trong moi test:

```ts
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});
```

Khi test code doc env trong constructor, set env truoc khi tao instance service.

### Time

Nhung target dung `new Date()`:

- `AmisMapperService.mapToAmisVoucher`
- `AmisMapperService.mapRetailBillToAmisVoucher`
- Controller response co timestamp

Harness nen fake time de snapshot output on dinh. Voi Vitest, dung `vi.useFakeTimers()` va `vi.setSystemTime(...)`.

### Random/GUID

`AmisMapperService` tao GUID bang `Math.random()`. Neu assert ca voucher, stub `Math.random()` hoac assert pattern GUID thay vi exact value.

### Network

Khong de Axios goi network that. Co ba cach an toan, theo thu tu de lam:

1. Chi test method pure khong cham Axios.
2. Stub method service duoc controller goi, vi du `nhanhService.getOrderList`.
3. Mock Axios instance o lop service neu can test request shape.

### File system

`AmisTokenManager.refreshToken()` co the ghi `.env`. Harness khong duoc goi ham nay voi env path that. Neu can test sau nay, can refactor constructor de nhan `envPath` hoac dung temp working directory co `.env` fake.

### Server import

Khong import `src/server.ts` trong harness dau tien. Import server hien tai se:

- Bind port qua `app.listen`.
- Khoi dong auto refresh token.
- Co the ghi `.env` thong qua token manager.

## Data builder principles

Builder nen tao payload hop le mac dinh, sau do cho phep override tung phan nho.

Vi du y tuong builder cho order:

```ts
function buildNhanhOrder(overrides = {}) {
  return deepMerge({
    info: { id: 123, createdAt: 1767225600, status: 60 },
    shippingAddress: { name: 'Nguyen Van A' },
    products: [
      { code: 'SKU-1', name: 'San pham 1', barcode: '893...', quantity: 2, price: 108000, discount: 0 }
    ],
    payment: { codAmount: 216000 }
  }, overrides);
}
```

Property/fuzz-style generator nen gioi han kich thuoc de harness nhanh:

- So product moi order: 0 den 20.
- String: 0 den 200 ky tu cho unit harness, co mot corpus rieng cho chuoi dai.
- Money: nen test ca range thuc te va mot range bat thuong.
- Timestamp: gom `0`, timestamp hop le, timestamp rat lon, va gia tri invalid neu type boundary cho phep.

## Assertions theo target

### `TransformService.transformOrderToRows`

- So row output bang `order.products.length` khi input hop le.
- `customerNameAndId` chua customer name da normalize va order id.
- `discountPercent` bang `discount / (price * quantity) * 100` khi total > 0.
- `unitPriceAfterTax` khong la `NaN`/`Infinity`.
- Khi discount vuot 50%, don gia dung discount cap 50%.

### `TransformService.exportToCSV`

- Dong header luon co dung so cot.
- Moi row co dung so cot tab-separated.
- Input rong chi sinh header va newline.
- Chuoi co tab/newline can duoc quyet dinh ro: chap nhan raw TSV hay sanitize/quote sau nay.

### `AmisMapperService.mapToAmisVoucher`

- Data rong throw `No product data to map`.
- Detail count bang data length.
- `sort_order` bat dau tu 1 va tang lien tiep.
- Tong tien la finite number.
- `total_amount` xap xi `total_sale_amount + total_vat_amount`.
- `org_refno` mac dinh la `DH{orderId}`.

### `AmisMapperService.mapRetailBillToAmisVoucher`

- Bill rong hoac khong co product throw `No product data in retail bill`.
- Customer thieu dung fallback hien tai.
- Detail count bang product count.
- `org_refno` mac dinh la `HDB{billId}`.
- So luong 0 khong tao `Infinity`.

### HMAC/callback

- `generateSHA256HMAC(data, key)` cho output lowercase hex dai 64 ky tu.
- Cung input/key cho cung signature.
- Doi data hoac key thi signature khac.
- Callback sai signature khong duoc enqueue process async.

### Webhook

- Signature sai tra 401 neu co header signature.
- Khong co signature van chap nhan neu config khong bat buoc.
- Response 200 duoc gui truoc khi fake background promise resolve.
- Event khong ho tro khong goi service Nhanh/AMIS.
- `paymentReceived` co bill id goi retail bill flow; thieu bill id thi skip.

## Lenh verify nen dung sau khi chi sua docs

```bash
npm run build
git status --short
```

Sau khi them test runner, cap nhat file nay voi lenh test moi va quy uoc ten file test.

