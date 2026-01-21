/**
 * Test with REAL order from Nhanh.vn
 */
import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/nhanh';

// Sử dụng đơn thật: 691747325
const REAL_ORDER_ID = 691747325;

async function testRealOrder() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   TEST WITH REAL ORDER 691747325      ║');
    console.log('╚════════════════════════════════════════╝\n');

    try {
        console.log('Sending webhook for REAL order...\n');

        const startTime = Date.now();
        const response = await axios.post(WEBHOOK_URL, {
            event: 'orderUpdate',
            businessId: 30923,
            data: {
                info: {
                    id: REAL_ORDER_ID,
                    status: 60,
                    depotId: 82686
                },
                channel: {
                    saleChannel: 1
                }
            }
        });

        const responseTime = Date.now() - startTime;

        console.log(`✅ Response received in ${responseTime}ms`);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        console.log('\n════════════════════════════════════════');
        console.log('Next steps:');
        console.log('1. Check server logs for processing details');
        console.log('2. Check MISA for new voucher with RefNo = 691747325');
        console.log('3. Check SQLite: sqlite3 data/webhooks.db "SELECT * FROM webhook_queue WHERE order_id = 691747325"');
        console.log('════════════════════════════════════════\n');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testRealOrder();
