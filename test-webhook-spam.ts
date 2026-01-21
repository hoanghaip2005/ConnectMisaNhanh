/**
 * Test Webhook Spam Scenario
 * Mô phỏng: status 54 → status 54 (retry) → status 60
 * Đảm bảo chỉ tạo chứng từ 1 lần ở status 60
 */

import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/nhanh';
const TEST_ORDER_ID = 999888777;

// Helper function để tạo webhook payload
function createWebhookPayload(orderId: number, status: number) {
    return {
        event: 'orderUpdate',
        businessId: 30923,
        data: {
            info: {
                id: orderId,
                status: status,
                depotId: 82686
            },
            channel: {
                saleChannel: 1
            }
        }
    };
}

async function sendWebhook(orderId: number, status: number, label: string) {
    const startTime = Date.now();
    try {
        const response = await axios.post(WEBHOOK_URL, createWebhookPayload(orderId, status));
        const duration = Date.now() - startTime;
        
        console.log(`\n${label}:`);
        console.log(`  ⏱️  Response time: ${duration}ms`);
        console.log(`  📦 Response:`, response.data);
        
        return { success: true, duration, data: response.data };
    } catch (error: any) {
        console.error(`  ❌ Error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testSpamScenario() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST: Webhook Spam Scenario');
    console.log('='.repeat(60));
    console.log(`\nTest Order ID: ${TEST_ORDER_ID}`);
    console.log('\nScenario:');
    console.log('  1. Webhook với status 54 (Đang giao)');
    console.log('  2. Webhook với status 54 (Retry từ Nhanh.vn)');
    console.log('  3. Webhook với status 60 (Thành công)');
    console.log('\nKết quả mong đợi:');
    console.log('  ✅ Cả 3 webhooks đều được queue (response 200)');
    console.log('  ✅ Chỉ webhook #3 (status 60) tạo chứng từ');
    console.log('  ✅ Không bị duplicate');
    console.log('\n' + '='.repeat(60));

    // Webhook 1: Status 54
    console.log('\n\n📤 WEBHOOK #1: Status 54 (Đang giao)');
    console.log('-'.repeat(60));
    await sendWebhook(TEST_ORDER_ID, 54, 'Lần 1');
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Chờ 500ms

    // Webhook 2: Status 54 (Retry)
    console.log('\n\n📤 WEBHOOK #2: Status 54 (Retry từ Nhanh.vn)');
    console.log('-'.repeat(60));
    await sendWebhook(TEST_ORDER_ID, 54, 'Lần 2 (Retry)');
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Chờ 500ms

    // Webhook 3: Status 60
    console.log('\n\n📤 WEBHOOK #3: Status 60 (Thành công)');
    console.log('-'.repeat(60));
    await sendWebhook(TEST_ORDER_ID, 60, 'Lần 3 (Success)');

    console.log('\n\n' + '='.repeat(60));
    console.log('✅ Test completed!');
    console.log('='.repeat(60));
    console.log('\n📝 Bây giờ hãy:');
    console.log('  1. Check server logs để xem quá trình xử lý');
    console.log('  2. Check database: sqlite3 data/webhooks.db "SELECT * FROM webhook_queue WHERE order_id = ' + TEST_ORDER_ID + '"');
    console.log('  3. Check MISA xem có chứng từ RefNo = ' + TEST_ORDER_ID);
    console.log('\n');
}

// Test spam liên tục (mô phỏng webhook retry gần như đồng thời)
async function testConcurrentSpam() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST: Concurrent Webhook Spam (Simultaneous)');
    console.log('='.repeat(60));
    console.log('\nGửi 3 webhooks cùng lúc (không chờ đợi):');
    console.log('\n' + '='.repeat(60));

    const TEST_ORDER_ID_2 = 999888666;

    const promises = [
        sendWebhook(TEST_ORDER_ID_2, 54, '🔵 Concurrent #1 (status 54)'),
        sendWebhook(TEST_ORDER_ID_2, 54, '🟢 Concurrent #2 (status 54)'),
        sendWebhook(TEST_ORDER_ID_2, 60, '🔴 Concurrent #3 (status 60)')
    ];

    await Promise.all(promises);

    console.log('\n\n' + '='.repeat(60));
    console.log('✅ Concurrent test completed!');
    console.log('='.repeat(60));
    console.log('\nKiểm tra xem có bị race condition không:');
    console.log('  sqlite3 data/webhooks.db "SELECT * FROM webhook_queue WHERE order_id = ' + TEST_ORDER_ID_2 + '"');
    console.log('\n');
}

// Chạy cả 2 tests
async function runAllTests() {
    // Test 1: Sequential spam
    await testSpamScenario();
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Chờ 2s
    
    // Test 2: Concurrent spam
    await testConcurrentSpam();
}

runAllTests()
    .then(() => {
        console.log('🎉 All tests completed!\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
