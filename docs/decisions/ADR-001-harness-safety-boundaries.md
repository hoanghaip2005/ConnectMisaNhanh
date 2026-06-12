# ADR-001: Harness Safety Boundaries

## Status

Accepted

## Date

2026-06-12

## Context

Du an `ConnectMisaNhanh` la middleware ket noi Nhanh.vn va MISA AMIS. Nhieu luong quan trong co side effect:

- Goi API Nhanh.vn va AMIS qua Axios.
- Doc secret/token tu `.env`.
- `AmisTokenManager` co the refresh token va ghi lai `.env`.
- `src/server.ts` bind port va start auto-refresh token ngay khi import.
- Webhook va callback dung `setImmediate` de xu ly background.

Neu viet harness ma khong dat ranh gioi, test/fuzz co the goi API that, lam thay doi token, ghi `.env`, tao ket qua khong deterministic, hoac treo do background task.

## Decision

Harness cho repo nay mac dinh phai offline va deterministic.

Cu the:

1. Khong goi network that tu harness mac dinh; moi Nhanh.vn/AMIS I/O phai duoc mock, stub, hoac fake.
2. Khong dung `.env` that cho test ghi file. Token manager chi duoc test voi temp file hoac sau khi co injection cho env path.
3. Khong import `src/server.ts` trong harness cho den khi app factory duoc tach khoi `listen` va auto-refresh.
4. Cac target dung thoi gian, GUID, random, hoac background scheduling phai duoc fake/stub khi assert output.
5. Uu tien harness cho business logic offline truoc: transform order, export CSV, map voucher, HMAC.
6. Endpoint/controller harness chi duoc them sau khi service layer da duoc fake ro rang.

## Alternatives Considered

### Viet endpoint integration harness truc tiep qua `src/server.ts`

- Pros: Gan voi runtime thuc te.
- Cons: Import server co the bind port, start refresh token, va ghi `.env`; de tao side effect ngoai y muon.
- Rejected: Qua rui ro cho buoc dau.

### Chi viet manual scripts de goi API dev

- Pros: Nhanh de thu nghiem voi payload thuc.
- Cons: Khong deterministic, can token/API that, kho dua vao CI, khong phu hop fuzz/property harness.
- Rejected: Chi nen dung nhu cong cu debug rieng, khong phai harness nen tang.

### Viet harness offline cho service pure truoc

- Pros: Nhanh, an toan, lap lai duoc, tim loi input bien tot.
- Cons: Chua cover duoc toan bo Express/network flow.
- Accepted: Phu hop nhat voi trang thai repo hien tai.

## Consequences

- Buoc tiep theo nen la them test runner TypeScript va builders/fixtures.
- Neu can endpoint harness, nen refactor nho de tao `createApp()` khong side effect.
- Cac test lien quan `.env`, token refresh, network, va background jobs can co helper isolation rieng.
- Tai lieu harness phai duoc cap nhat khi co test runner, app factory, hoac dependency fuzz/property moi.

