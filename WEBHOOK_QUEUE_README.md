# Webhook Queue với MySQL

## 🎯 Mục đích

Lưu webhook vào MySQL database trước, sau đó xử lý background để:
- ✅ Response nhanh (<50ms) cho Nhanh.vn → Tránh timeout
- ✅ Tự động check duplicate → Không tạo chứng từ trùng
- ✅ Có thể retry khi lỗi
- ✅ Dễ monitor và debug

## 📋 Cài đặt

### 1. Cài đặt MySQL

```bash
# macOS
brew install mysql
brew services start mysql

# Ubuntu
sudo apt install mysql-server
sudo systemctl start mysql
```

### 2. Tạo database

```bash
# Login MySQL
mysql -u root -p

# Tạo database
CREATE DATABASE middleware_integration CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Tạo user (tuỳ chọn)
CREATE USER 'middleware'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON middleware_integration.* TO 'middleware'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Cấu hình .env

```bash
# Copy .env.example
cp .env.example .env

# Sửa MySQL credentials
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=middleware_integration
```

### 4. Chạy migration

```bash
# Cách 1: Dùng script
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh

# Cách 2: Import trực tiếp
mysql -u root -p middleware_integration < database/schema.sql
```

### 5. Build và chạy

```bash
npm run build
npm start
```

## 🔄 Luồng hoạt động

```
1. Webhook đến → POST /api/webhooks/nhanh
2. Lưu vào table webhook_queue
3. Check duplicate với table processed_orders
4. Response 200 ngay lập tức (<50ms)
5. Xử lý background:
   - Check history
   - Tạo chứng từ AMIS
   - Mark as completed
```

## 📊 Database Schema

### Table: `webhook_queue`
```sql
- id: INT (auto increment)
- event: VARCHAR(50) 
- order_id: BIGINT
- business_id: INT
- payload: JSON
- status: ENUM('pending', 'processing', 'completed', 'failed')
- retry_count: INT
- error_message: TEXT
- created_at: TIMESTAMP
- processed_at: TIMESTAMP
```

### Table: `processed_orders`
```sql
- id: INT (auto increment)
- order_id: BIGINT (UNIQUE)
- created_at: TIMESTAMP
```

## 🔍 Query hữu ích

```sql
-- Xem webhook đang pending
SELECT * FROM webhook_queue WHERE status = 'pending';

-- Xem webhook failed
SELECT * FROM webhook_queue WHERE status = 'failed';

-- Xem order đã xử lý
SELECT * FROM processed_orders ORDER BY created_at DESC LIMIT 10;

-- Reset order để test lại
DELETE FROM processed_orders WHERE order_id = 123456;
DELETE FROM webhook_queue WHERE order_id = 123456;
```

## 🚀 Deploy lên VPS

```bash
# 1. Pull code
cd /root/middleware-integration
git pull

# 2. Install dependencies
npm install

# 3. Setup MySQL (nếu chưa có)
sudo apt install mysql-server
mysql -u root -p < database/schema.sql

# 4. Update .env với MySQL credentials

# 5. Build
npm run build

# 6. Restart PM2
pm2 restart connect-misa-nhanh

# 7. Check logs
pm2 logs connect-misa-nhanh
```

## 📝 Notes

- Webhook retry từ Nhanh.vn sẽ bị check duplicate tại bước 2
- Nếu xử lý fail, có thể retry lại bằng cronjob
- Table `processed_orders` có thể clean up định kỳ (sau 30 ngày)
