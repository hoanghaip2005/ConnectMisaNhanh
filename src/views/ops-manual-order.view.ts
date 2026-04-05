function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderManualOrderPage(serverUrl?: string): string {
    const subtitle = serverUrl
        ? `Manual sync page for ${escapeHtml(serverUrl)}`
        : 'Manual sync page for Nhanh to MISA';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Manual Order Sync</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f4f1e8;
            --panel: rgba(255, 252, 247, 0.94);
            --panel-border: rgba(35, 42, 51, 0.12);
            --text: #1f2a32;
            --muted: #66707a;
            --accent: #0f766e;
            --accent-soft: rgba(15, 118, 110, 0.12);
            --warning: #b54708;
            --warning-soft: rgba(181, 71, 8, 0.12);
            --danger: #b42318;
            --danger-soft: rgba(180, 35, 24, 0.1);
            --shadow: 0 18px 50px rgba(36, 45, 56, 0.12);
            --radius: 24px;
            --sans: "Avenir Next", "Segoe UI", sans-serif;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: var(--sans);
            color: var(--text);
            background:
                radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 32%),
                radial-gradient(circle at top right, rgba(181, 71, 8, 0.14), transparent 28%),
                linear-gradient(180deg, #f9f4eb 0%, var(--bg) 100%);
        }

        .shell {
            width: min(820px, calc(100vw - 24px));
            margin: 0 auto;
            padding: 24px 0 40px;
        }

        .panel {
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            overflow: hidden;
        }

        .hero {
            padding: 28px;
            display: grid;
            gap: 14px;
            background: linear-gradient(135deg, rgba(255, 252, 247, 0.96), rgba(246, 252, 251, 0.92));
        }

        h1,
        h2,
        p {
            margin: 0;
        }

        h1 {
            font-size: clamp(1.9rem, 4vw, 2.8rem);
            letter-spacing: -0.04em;
        }

        p {
            color: var(--muted);
            line-height: 1.55;
        }

        .badge-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            padding: 9px 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.78);
            border: 1px solid rgba(20, 29, 37, 0.08);
            color: var(--muted);
            font-size: 0.92rem;
        }

        .body {
            padding: 22px 28px 28px;
            display: grid;
            gap: 16px;
        }

        .input-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 12px;
        }

        input,
        button {
            font: inherit;
        }

        input {
            width: 100%;
            border: 1px solid rgba(20, 29, 37, 0.14);
            background: rgba(255, 255, 255, 0.92);
            border-radius: 16px;
            padding: 14px 16px;
        }

        button {
            border: 0;
            border-radius: 999px;
            padding: 12px 18px;
            background: var(--accent);
            color: white;
            cursor: pointer;
            transition: transform 0.18s ease, opacity 0.18s ease;
        }

        button:hover {
            transform: translateY(-1px);
            opacity: 0.94;
        }

        button:disabled {
            opacity: 0.6;
            cursor: wait;
            transform: none;
        }

        a {
            color: var(--accent);
            text-decoration: none;
        }

        .meta {
            color: var(--muted);
            font-size: 0.94rem;
        }

        .result-card {
            padding: 16px 18px;
            border-radius: 18px;
            border: 1px solid rgba(20, 29, 37, 0.08);
            background: rgba(255, 255, 255, 0.74);
            display: grid;
            gap: 8px;
        }

        .status {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .status.success {
            color: var(--accent);
            background: var(--accent-soft);
        }

        .status.warning {
            color: var(--warning);
            background: var(--warning-soft);
        }

        .status.error {
            color: var(--danger);
            background: var(--danger-soft);
        }

        .result-grid {
            display: grid;
            gap: 12px;
        }

        @media (max-width: 680px) {
            .shell {
                width: min(100vw - 16px, 820px);
            }

            .hero,
            .body {
                padding-left: 18px;
                padding-right: 18px;
            }

            .input-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <main class="shell">
        <section class="panel">
            <div class="hero">
                <div>
                    <h1>Manual Order Sync</h1>
                    <p>${subtitle}</p>
                </div>
                <div class="badge-row">
                    <span class="badge">Nhap 1 ID don Nhanh de day tu middleware sang MISA</span>
                    <span class="badge">Su dung chung Basic Auth voi /ops</span>
                </div>
            </div>
            <div class="body">
                <div class="input-row">
                    <input id="orderIdInput" type="number" inputmode="numeric" placeholder="Vi du: 123456789" />
                    <button id="processButton" type="button">Tao</button>
                </div>
                <div id="pageMeta" class="meta">Endpoint su dung: <code>/api/ops/orders/:orderId/process</code></div>
                <div id="result" class="result-grid">
                    <div class="result-card">
                        <strong>San sang xu ly</strong>
                        <span class="meta">Nhap mot orderId va bam "Tao" de goi luong xu ly don hang thu cong.</span>
                    </div>
                </div>
                <div class="meta">
                    <a href="/ops">Mo dashboard /ops</a>
                </div>
            </div>
        </section>
    </main>

    <script src="/ops/assets/manual-order.js" defer></script>
</body>
</html>`;
}

export function renderManualOrderScript(): string {
    return `function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) {
        return '-';
    }

    try {
        return new Date(value).toLocaleString('vi-VN');
    } catch (_error) {
        return String(value);
    }
}

async function requestJson(url, options) {
    const body = options && options.body ? JSON.stringify(options.body) : undefined;
    const response = await fetch(url, {
        method: options && options.method ? options.method : 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        body: body
    });

    const payload = await response.json().catch(function() {
        return null;
    });

    if (!response.ok) {
        throw new Error(payload && payload.message ? payload.message : ('Request failed with status ' + response.status));
    }

    return payload;
}

function renderResult(type, title, message, data) {
    const target = document.getElementById('result');
    const meta = document.getElementById('pageMeta');
    const orderId = data && data.orderId ? data.orderId : '-';
    const processedAt = data && data.processedAt ? formatDate(data.processedAt) : formatDate(new Date().toISOString());

    target.innerHTML = '<div class="result-card">' +
        '<span class="status ' + escapeHtml(type) + '">' + escapeHtml(title) + '</span>' +
        '<strong>Order ' + escapeHtml(orderId) + '</strong>' +
        '<span>' + escapeHtml(message) + '</span>' +
        '<span class="meta">Cap nhat luc ' + escapeHtml(processedAt) + '</span>' +
    '</div>';

    meta.textContent = 'Lan xu ly gan nhat: ' + formatDate(new Date().toISOString());
}

async function processOrder() {
    const input = document.getElementById('orderIdInput');
    const button = document.getElementById('processButton');
    const orderId = input.value.trim();

    if (!orderId) {
        renderResult('warning', 'Can nhap ID', 'Ban chua nhap orderId.', {
            orderId: '-'
        });
        return;
    }

    button.disabled = true;
    button.textContent = 'Dang tao...';

    try {
        const response = await requestJson('/api/ops/orders/' + encodeURIComponent(orderId) + '/process', {
            method: 'POST',
            body: {}
        });

        const payload = response || {};
        const statusType = payload.alreadyProcessed ? 'warning' : 'success';
        const statusTitle = payload.alreadyProcessed ? 'Da xu ly' : 'Thanh cong';

        renderResult(statusType, statusTitle, payload.message || 'Xu ly thanh cong.', {
            orderId: payload.orderId || orderId,
            processedAt: new Date().toISOString()
        });
    } catch (error) {
        renderResult('error', 'That bai', error.message || 'Khong the xu ly don hang.', {
            orderId: orderId,
            processedAt: new Date().toISOString()
        });
    } finally {
        button.disabled = false;
        button.textContent = 'Tao';
    }
}

document.getElementById('processButton').addEventListener('click', function() {
    processOrder();
});

document.getElementById('orderIdInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        processOrder();
    }
});`;
}
