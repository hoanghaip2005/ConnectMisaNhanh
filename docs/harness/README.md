# Skill Harness Documentation

Bo tai lieu nay la lop nen de viet test harness, fuzz harness, hoac integration harness cho du an `ConnectMisaNhanh` ma khong vo tinh cham vao API that, token that, hoac file `.env` that.

## Muc tieu

- Ghi lai cau truc du an truoc khi them bat ky harness nao.
- Xac dinh cac vung nen uu tien kiem thu bang harness: transform don hang, map voucher AMIS, callback/webhook, chu ky HMAC.
- Dat ranh gioi an toan cho harness: deterministic, khong network that, khong ghi secret, khong phu thuoc thoi gian/he thong neu chua duoc stub.
- Tao bo tai lieu de cac lan lam viec sau co the bat dau tu cung mot ban do, khong phai suy luan lai tu dau.

## Pham vi du an hien tai

Du an la mot middleware Node.js/TypeScript dung Express de ket noi:

- Nhanh.vn OAuth, order list, retail bill, webhook.
- MISA AMIS token, callback, save/delete voucher.
- Transform du lieu Nhanh.vn thanh bang phang va voucher AMIS.

Stack hien tai:

- Runtime: Node.js, TypeScript, CommonJS output.
- Server: Express 5, Helmet, CORS.
- HTTP client: Axios.
- Config: dotenv va bien moi truong.
- Build: `npm run build` chay `tsc`.
- Test: chua co test runner that; `npm test` hien tai chi bao loi mac dinh.

## Nguyen tac harness cho repo nay

1. Khong goi Nhanh.vn hoac AMIS that tu harness mac dinh. Tat ca HTTP phai duoc mock/stub.
2. Khong import `src/server.ts` trong harness tru khi da tach app factory, vi file nay goi `app.listen` va khoi dong auto-refresh token khi import.
3. Khong ghi vao `.env` that. Neu can test token manager, dung file temp hoac inject duong dan truoc.
4. Dong bang thoi gian va random khi assert output co `Date` hoac GUID.
5. Input fuzz phai chap nhan payload rong, thieu field, so am, so 0, so qua lon, chuoi dai, Unicode, va gia tri `NaN`/`Infinity` neu generator co the tao ra.
6. Crash trong harness chi co gia tri neu no chi ra bug trong SUT. Crash do harness truy cap field thieu ma khong dung boundary thi phai sua harness truoc.
7. Corpus/fixture khong duoc chua token, app id that, business id that, access code that, secret key that.

## Doc map

- [Project Structure](./project-structure.md): ban do thu muc, luong request, va cac diem can can than.
- [Target Inventory](./target-inventory.md): danh sach target nen viet harness va ly do uu tien.
- [Harness Playbook](./harness-playbook.md): cach thiet ke harness TypeScript cho repo nay, gom isolation, data builders, invariants, va lenh kiem tra.
- [ADR-001: Harness Safety Boundaries](../decisions/ADR-001-harness-safety-boundaries.md): quyet dinh ve viec tach harness khoi network, secret, `.env`, va server side effects.

## Viec nen lam tiep theo

Thu tu an toan khi bat dau implement harness:

1. Them test runner nhe cho TypeScript, vi repo hien chua co test script that.
2. Viet unit harness dau tien cho `TransformService.transformOrderToRows` va `exportToCSV`.
3. Them harness cho `AmisMapperService` voi fake time/random/env.
4. Sau do moi them endpoint/integration harness cho webhook voi stub Nhanh/AMIS.

