function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderOpsDashboardPage(serverUrl?: string): string {
    const subtitle = serverUrl ? `Dashboard for ${escapeHtml(serverUrl)}` : 'Internal operations dashboard';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Operations Dashboard</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f4f1e8;
            --panel: rgba(255, 252, 247, 0.92);
            --panel-border: rgba(35, 42, 51, 0.12);
            --text: #1f2a32;
            --muted: #6c7680;
            --accent: #0f766e;
            --accent-soft: rgba(15, 118, 110, 0.12);
            --danger: #b42318;
            --danger-soft: rgba(180, 35, 24, 0.1);
            --warning: #b54708;
            --warning-soft: rgba(181, 71, 8, 0.1);
            --shadow: 0 18px 50px rgba(36, 45, 56, 0.12);
            --radius: 22px;
            --mono: "SFMono-Regular", "Menlo", "Monaco", monospace;
            --sans: "Avenir Next", "Segoe UI", sans-serif;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: var(--sans);
            color: var(--text);
            background:
                radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 32%),
                radial-gradient(circle at top right, rgba(181, 71, 8, 0.14), transparent 28%),
                linear-gradient(180deg, #f9f4eb 0%, var(--bg) 100%);
            min-height: 100vh;
        }

        .shell {
            width: min(1400px, calc(100vw - 24px));
            margin: 0 auto;
            padding: 20px 0 40px;
        }

        .hero {
            display: grid;
            gap: 16px;
            padding: 28px;
            background: linear-gradient(135deg, rgba(255, 252, 247, 0.92), rgba(246, 252, 251, 0.92));
            border: 1px solid rgba(20, 29, 37, 0.08);
            border-radius: calc(var(--radius) + 6px);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
        }

        .hero h1 {
            margin: 0;
            font-size: clamp(1.8rem, 4vw, 3rem);
            letter-spacing: -0.04em;
        }

        .hero p {
            margin: 0;
            color: var(--muted);
            max-width: 820px;
            line-height: 1.55;
        }

        .hero-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 9px 12px;
            background: rgba(255, 255, 255, 0.74);
            border: 1px solid rgba(20, 29, 37, 0.08);
            border-radius: 999px;
            color: var(--muted);
            font-size: 0.92rem;
        }

        .grid {
            display: grid;
            gap: 18px;
            margin-top: 18px;
        }

        .cards {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .two-up {
            grid-template-columns: 1.1fr 0.9fr;
        }

        .panel {
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            overflow: hidden;
        }

        .panel-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 18px 20px 14px;
            border-bottom: 1px solid rgba(20, 29, 37, 0.08);
        }

        .panel-head h2,
        .panel-head h3 {
            margin: 0;
            font-size: 1.02rem;
            letter-spacing: -0.02em;
        }

        .panel-body {
            padding: 18px 20px 20px;
        }

        .stat-card {
            padding: 18px;
        }

        .stat-label {
            color: var(--muted);
            font-size: 0.92rem;
            margin-bottom: 8px;
        }

        .stat-value {
            font-size: clamp(1.8rem, 3vw, 2.4rem);
            font-weight: 700;
            letter-spacing: -0.05em;
        }

        .stat-note {
            margin-top: 8px;
            color: var(--muted);
            font-size: 0.9rem;
        }

        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        button,
        input,
        select {
            font: inherit;
        }

        button {
            border: 0;
            border-radius: 999px;
            padding: 10px 14px;
            cursor: pointer;
            background: var(--accent);
            color: white;
            transition: transform 0.18s ease, opacity 0.18s ease;
        }

        button:hover {
            transform: translateY(-1px);
            opacity: 0.94;
        }

        button.secondary {
            background: rgba(31, 42, 50, 0.08);
            color: var(--text);
        }

        .search-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .search-row input {
            flex: 1 1 240px;
            min-width: 0;
            border: 1px solid rgba(20, 29, 37, 0.14);
            background: rgba(255, 255, 255, 0.9);
            border-radius: 14px;
            padding: 12px 14px;
        }

        .summary-list {
            display: grid;
            gap: 12px;
        }

        .summary-item {
            padding: 14px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.7);
            border: 1px solid rgba(20, 29, 37, 0.08);
        }

        .summary-item strong {
            display: block;
            margin-bottom: 6px;
        }

        .table-wrap {
            overflow: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 720px;
        }

        th,
        td {
            text-align: left;
            padding: 12px 10px;
            border-bottom: 1px solid rgba(20, 29, 37, 0.08);
            vertical-align: top;
        }

        th {
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
        }

        td {
            font-size: 0.95rem;
        }

        .status {
            display: inline-flex;
            align-items: center;
            padding: 5px 10px;
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 600;
            text-transform: capitalize;
        }

        .status.pending,
        .status.processing {
            color: #8a4b07;
            background: var(--warning-soft);
        }

        .status.completed {
            color: #0f766e;
            background: var(--accent-soft);
        }

        .status.failed {
            color: var(--danger);
            background: var(--danger-soft);
        }

        .log-block {
            margin: 0;
            min-height: 280px;
            max-height: 540px;
            overflow: auto;
            border-radius: 18px;
            padding: 16px;
            background: #182127;
            color: #e8f0ef;
            border: 1px solid rgba(255, 255, 255, 0.06);
            font-family: var(--mono);
            font-size: 0.85rem;
            line-height: 1.55;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .meta,
        .empty {
            color: var(--muted);
            font-size: 0.92rem;
        }

        .error-text {
            color: var(--danger);
        }

        .pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .pill {
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(31, 42, 50, 0.08);
            font-size: 0.88rem;
            color: var(--muted);
        }

        @media (max-width: 960px) {
            .two-up {
                grid-template-columns: 1fr;
            }

            .shell {
                width: min(100vw - 16px, 1400px);
            }

            .hero,
            .panel-head,
            .panel-body {
                padding-left: 16px;
                padding-right: 16px;
            }
        }
    </style>
</head>
<body>
    <main class="shell">
        <section class="hero">
            <div>
                <h1>Operations Dashboard</h1>
                <p>${subtitle}</p>
            </div>
            <div class="hero-meta">
                <span class="badge">Live view for webhook queue, processed orders, and PM2 logs</span>
                <span class="badge">Auto refresh every 30 seconds</span>
                <span class="badge" id="generatedAt">Loading snapshot...</span>
            </div>
        </section>

        <section class="grid cards" id="statCards">
            <article class="panel stat-card">
                <div class="stat-label">Queue Total</div>
                <div class="stat-value">-</div>
                <div class="stat-note">Waiting for database</div>
            </article>
        </section>

        <section class="grid two-up">
            <article class="panel">
                <div class="panel-head">
                    <h2>Lookup By Order ID</h2>
                    <div class="toolbar">
                        <button type="button" class="secondary" id="refreshLookup">Refresh last lookup</button>
                    </div>
                </div>
                <div class="panel-body">
                    <div class="search-row">
                        <input id="orderSearchInput" type="number" inputmode="numeric" placeholder="Enter order ID, for example 123456789" />
                        <button type="button" id="lookupButton">Lookup</button>
                    </div>
                    <div id="lookupMeta" class="meta" style="margin-top: 12px;">Search for a specific order to inspect webhook history and processed results.</div>
                    <div id="lookupResult" class="summary-list" style="margin-top: 14px;"></div>
                </div>
            </article>

            <article class="panel">
                <div class="panel-head">
                    <h2>System Summary</h2>
                    <div class="toolbar">
                        <button type="button" id="refreshOverview">Refresh now</button>
                    </div>
                </div>
                <div class="panel-body">
                    <div class="summary-list" id="systemSummary"></div>
                </div>
            </article>
        </section>

        <section class="grid two-up">
            <article class="panel">
                <div class="panel-head">
                    <h2>Recent Webhook Queue</h2>
                    <div class="toolbar">
                        <button type="button" class="secondary" id="reloadQueue">Reload</button>
                    </div>
                </div>
                <div class="panel-body table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Order</th>
                                <th>Event</th>
                                <th>Status</th>
                                <th>Retries</th>
                                <th>Created</th>
                                <th>Processed</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody id="recentQueueTable"></tbody>
                    </table>
                </div>
            </article>

            <article class="panel">
                <div class="panel-head">
                    <h2>Recent Processed Orders</h2>
                    <div class="toolbar">
                        <button type="button" class="secondary" id="reloadProcessed">Reload</button>
                    </div>
                </div>
                <div class="panel-body table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Order</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody id="processedOrdersTable"></tbody>
                    </table>
                </div>
            </article>
        </section>

        <section class="grid two-up">
            <article class="panel">
                <div class="panel-head">
                    <h3>PM2 Stdout Log</h3>
                    <div class="toolbar pill-row">
                        <span class="pill" id="stdoutMeta">Loading...</span>
                        <button type="button" class="secondary" data-log-type="out">Reload log</button>
                    </div>
                </div>
                <div class="panel-body">
                    <pre id="stdoutLog" class="log-block">Loading PM2 stdout log...</pre>
                </div>
            </article>

            <article class="panel">
                <div class="panel-head">
                    <h3>PM2 Error Log</h3>
                    <div class="toolbar pill-row">
                        <span class="pill" id="stderrMeta">Loading...</span>
                        <button type="button" class="secondary" data-log-type="error">Reload log</button>
                    </div>
                </div>
                <div class="panel-body">
                    <pre id="stderrLog" class="log-block">Loading PM2 error log...</pre>
                </div>
            </article>
        </section>
    </main>

    <script src="/ops/assets/app.js" defer></script>
</body>
</html>`;
}

export function renderOpsDashboardScript(): string {
    return `const state = {
    lastOrderId: null
};

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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function statusBadge(status) {
    const safeStatus = status || 'unknown';
    return '<span class="status ' + safeStatus + '">' + escapeHtml(safeStatus) + '</span>';
}

async function requestJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || ('Request failed with status ' + response.status));
    }

    return response.json();
}

function renderStatCards(summary) {
    const cards = [
        { label: 'Queue Total', value: summary.totalQueue, note: 'All webhook rows in MySQL' },
        { label: 'Pending', value: summary.pending, note: 'Waiting for processing' },
        { label: 'Processing', value: summary.processing, note: 'Currently being handled' },
        { label: 'Completed', value: summary.completed, note: 'Finished successfully' },
        { label: 'Failed', value: summary.failed, note: 'Needs checking' },
        { label: 'Processed Orders', value: summary.totalProcessedOrders, note: 'Written to processed_orders' }
    ];

    document.getElementById('statCards').innerHTML = cards.map(function(card) {
        return '<article class="panel stat-card">' +
            '<div class="stat-label">' + escapeHtml(card.label) + '</div>' +
            '<div class="stat-value">' + escapeHtml(card.value) + '</div>' +
            '<div class="stat-note">' + escapeHtml(card.note) + '</div>' +
        '</article>';
    }).join('');
}

function renderSystemSummary(data) {
    const items = [
        '<div class="summary-item"><strong>Environment</strong><span>' + escapeHtml(data.environment || '-') + '</span></div>',
        '<div class="summary-item"><strong>Server URL</strong><span>' + escapeHtml(data.serverUrl || window.location.origin) + '</span></div>',
        '<div class="summary-item"><strong>Last Webhook</strong><span>' + escapeHtml(formatDate(data.database.summary.lastWebhookAt)) + '</span></div>',
        '<div class="summary-item"><strong>Snapshot Generated</strong><span>' + escapeHtml(formatDate(data.generatedAt)) + '</span></div>',
        '<div class="summary-item"><strong>Stdout Log</strong><span>' + escapeHtml(data.logs.out.path || 'Not configured') + '</span></div>',
        '<div class="summary-item"><strong>Error Log</strong><span>' + escapeHtml(data.logs.error.path || 'Not configured') + '</span></div>'
    ];

    document.getElementById('systemSummary').innerHTML = items.join('');
    document.getElementById('generatedAt').textContent = 'Snapshot ' + formatDate(data.generatedAt);
}

function renderQueueTable(rows) {
    const body = document.getElementById('recentQueueTable');

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty">No webhook queue rows found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(function(row) {
        return '<tr>' +
            '<td>' + escapeHtml(row.id) + '</td>' +
            '<td>' + escapeHtml(row.order_id) + '</td>' +
            '<td>' + escapeHtml(row.event) + '</td>' +
            '<td>' + statusBadge(row.status) + '</td>' +
            '<td>' + escapeHtml(row.retry_count || 0) + '</td>' +
            '<td>' + escapeHtml(formatDate(row.created_at)) + '</td>' +
            '<td>' + escapeHtml(formatDate(row.processed_at)) + '</td>' +
            '<td class="' + (row.error_message ? 'error-text' : '') + '">' + escapeHtml(row.error_message || '-') + '</td>' +
        '</tr>';
    }).join('');
}

function renderProcessedOrders(rows) {
    const body = document.getElementById('processedOrdersTable');

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="3" class="empty">No processed orders found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(function(row) {
        return '<tr>' +
            '<td>' + escapeHtml(row.id) + '</td>' +
            '<td>' + escapeHtml(row.order_id) + '</td>' +
            '<td>' + escapeHtml(formatDate(row.created_at)) + '</td>' +
        '</tr>';
    }).join('');
}

function renderLookup(data) {
    const target = document.getElementById('lookupResult');
    const meta = document.getElementById('lookupMeta');

    if (!data.found) {
        target.innerHTML = '<div class="summary-item"><strong>No data found</strong><span>Order ' + escapeHtml(data.orderId) + ' does not exist in webhook_queue or processed_orders.</span></div>';
        meta.textContent = 'Lookup finished at ' + formatDate(new Date().toISOString());
        return;
    }

    const parts = [];
    parts.push('<div class="summary-item"><strong>Processed Records</strong><span>' + escapeHtml(data.processedRecords.length) + ' row(s) in processed_orders.</span></div>');

    if (data.queueItems.length) {
        parts.push(data.queueItems.map(function(item) {
            return '<div class="summary-item">' +
                '<strong>#' + escapeHtml(item.id) + ' · ' + escapeHtml(item.event) + '</strong>' +
                '<div>' + statusBadge(item.status) + '</div>' +
                '<div style="margin-top: 8px;">Created: ' + escapeHtml(formatDate(item.created_at)) + '</div>' +
                '<div>Processed: ' + escapeHtml(formatDate(item.processed_at)) + '</div>' +
                '<div>Retries: ' + escapeHtml(item.retry_count || 0) + '</div>' +
                '<div class="' + (item.error_message ? 'error-text' : '') + '">Error: ' + escapeHtml(item.error_message || '-')
                + '</div>' +
            '</div>';
        }).join(''));
    }

    target.innerHTML = parts.join('');
    meta.textContent = 'Lookup finished at ' + formatDate(new Date().toISOString());
}

function renderLog(targetId, metaId, payload) {
    const target = document.getElementById(targetId);
    const meta = document.getElementById(metaId);

    const body = payload.lines && payload.lines.length
        ? payload.lines.join('\\n')
        : (payload.message || 'No log lines available.');

    target.textContent = body;
    meta.textContent = payload.filename
        ? payload.filename + ' · ' + formatDate(payload.updatedAt)
        : (payload.message || 'Log file not configured');
}

async function loadOverview() {
    const response = await requestJson('/api/ops/overview');
    renderStatCards(response.data.database.summary);
    renderSystemSummary(response.data);
    renderQueueTable(response.data.recentQueue || []);
    renderProcessedOrders(response.data.recentProcessedOrders || []);
}

async function loadLog(type) {
    const response = await requestJson('/api/ops/logs/' + type);

    if (type === 'out') {
        renderLog('stdoutLog', 'stdoutMeta', response.data);
    } else {
        renderLog('stderrLog', 'stderrMeta', response.data);
    }
}

async function lookupOrder(orderId) {
    if (!orderId) {
        return;
    }

    state.lastOrderId = orderId;
    const response = await requestJson('/api/ops/orders/' + encodeURIComponent(orderId));
    renderLookup(response.data);
}

async function safeRun(action) {
    try {
        await action();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Unexpected error');
    }
}

document.getElementById('refreshOverview').addEventListener('click', function() {
    safeRun(loadOverview);
});

document.getElementById('reloadQueue').addEventListener('click', function() {
    safeRun(loadOverview);
});

document.getElementById('reloadProcessed').addEventListener('click', function() {
    safeRun(loadOverview);
});

document.getElementById('lookupButton').addEventListener('click', function() {
    const input = document.getElementById('orderSearchInput');
    safeRun(function() {
        return lookupOrder(input.value.trim());
    });
});

document.getElementById('refreshLookup').addEventListener('click', function() {
    if (!state.lastOrderId) {
        alert('No order has been searched yet.');
        return;
    }

    safeRun(function() {
        return lookupOrder(state.lastOrderId);
    });
});

document.getElementById('orderSearchInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('lookupButton').click();
    }
});

Array.from(document.querySelectorAll('[data-log-type]')).forEach(function(button) {
    button.addEventListener('click', function() {
        const type = button.getAttribute('data-log-type');
        safeRun(function() {
            return loadLog(type);
        });
    });
});

safeRun(async function() {
    await Promise.all([
        loadOverview(),
        loadLog('out'),
        loadLog('error')
    ]);
});

setInterval(function() {
    safeRun(async function() {
        await Promise.all([
            loadOverview(),
            loadLog('out'),
            loadLog('error')
        ]);

        if (state.lastOrderId) {
            await lookupOrder(state.lastOrderId);
        }
    });
}, 30000);`;
}
