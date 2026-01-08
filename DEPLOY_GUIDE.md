# 🚀 Quick Deploy Guide - Fix Webhook Timeout

## 🎯 Vấn đề đã fix
✅ **Webhook timeout sau 3 giây** → Giờ response < 1 giây  
✅ **31/31 đơn sẽ được xử lý thành công** (không còn timeout)

---

## 📦 Deploy lên VPS

### 1. Upload code mới
```bash
# Từ máy local - commit và push
git add .
git commit -m "Fix webhook timeout - async processing"
git push origin main

# Trên VPS - pull code mới
ssh user@your-vps
cd /path/to/middleware-integration
git pull origin main
```

### 2. Build và Restart
```bash
# Build lại
npm install
npm run build

# Restart service
pm2 restart middleware-integration
# hoặc nếu dùng systemd:
sudo systemctl restart your-service-name

# Kiểm tra logs
pm2 logs middleware-integration --lines 50
```

### 3. Kiểm tra Firewall
```bash
# Ubuntu/Debian với UFW
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
sudo ufw status

# CentOS/RHEL với firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

**Nếu dùng Cloud (AWS/DigitalOcean/GCP):**
- Vào Security Groups / Firewall
- Thêm Inbound Rules cho port 3000, 80, 443
- Source: 0.0.0.0/0

---

## 🧪 Test

### Cách 1: Dùng script tự động
```bash
# Trên VPS
cd /path/to/middleware-integration
./test-webhook.sh
```

Kết quả mong đợi:
```
✅ Health Check OK - Response time < 1s
✅ Status Check OK - Response time < 1s  
✅ Webhook POST OK - Response time < 1s
✅✅✅ ALL TESTS PASSED!
```

### Cách 2: Test thủ công
```bash
# Test health check
curl -X GET https://api.activ.vn/api/webhooks/health

# Test webhook
curl -X POST https://api.activ.vn/api/webhooks/nhanh \
  -H "Content-Type: application/json" \
  -d '{
    "event": "orderUpdate",
    "businessId": 30923,
    "data": {
      "info": {"id": 999999, "status": 60},
      "channel": {"saleChannel": 42}
    }
  }'
```

### Cách 3: Test từ Nhanh.vn Portal
1. Vào **Cài đặt → Webhooks**
2. Test endpoint: `https://api.activ.vn/api/webhooks/health`
3. Phải nhận được response ngay lập tức

---

## ✅ Checklist Deploy

- [ ] Code đã push lên git
- [ ] VPS đã pull code mới
- [ ] `npm run build` thành công
- [ ] PM2/service đã restart
- [ ] Firewall đã mở port 3000, 80, 443
- [ ] Test health check OK (response < 1s)
- [ ] Test webhook POST OK (response < 1s)
- [ ] Logs hiển thị "Webhook received and queued"
- [ ] Cấu hình webhook trên Nhanh.vn đúng URL

---

## 🔍 Debug

### Nếu vẫn timeout:

**1. Kiểm tra server running:**
```bash
pm2 status
netstat -tlnp | grep 3000
```

**2. Kiểm tra response time:**
```bash
time curl https://api.activ.vn/api/webhooks/health
```
Phải < 1 giây!

**3. Kiểm tra logs:**
```bash
pm2 logs middleware-integration
```

Phải thấy:
```
[WEBHOOK] Processing order 681155116 with status 60
[WEBHOOK] Order processing completed successfully
```

**4. Kiểm tra NGINX (nếu có):**
```bash
sudo nano /etc/nginx/sites-available/default

# Thêm timeout settings:
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;

sudo nginx -t
sudo systemctl restart nginx
```

**5. Kiểm tra resources:**
```bash
top
free -h
df -h
```

---

## 📚 Tài liệu chi tiết

Xem file `WEBHOOK_TIMEOUT_FIX.md` để hiểu rõ hơn về:
- Nguyên nhân timeout
- Cách code đã được fix
- Troubleshooting chi tiết
- Monitoring và optimization

---

## 🎉 Kết quả

Sau khi deploy:
- ✅ **Webhook response < 1 giây** (không timeout)
- ✅ **31/31 đơn được xử lý thành công**
- ✅ **Xử lý trong background** (không block)
- ✅ **Nhanh không gửi lại webhook** (do nhận được response 200 ngay)

---

## 📞 Support

Nếu vẫn gặp vấn đề, check:
1. Server có đủ RAM/CPU không?
2. MISA API có phản hồi nhanh không?
3. Network từ Nhanh → VPS có ổn định không?

Xem logs chi tiết:
```bash
pm2 logs middleware-integration --lines 200
```
