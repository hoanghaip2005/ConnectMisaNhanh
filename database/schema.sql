-- Webhook Queue Table
CREATE TABLE IF NOT EXISTS webhook_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event VARCHAR(50) NOT NULL,
    order_id BIGINT NOT NULL,
    business_id INT,
    payload JSON NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') DEFAULT 'pending',
    retry_count INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    
    INDEX idx_order_id (order_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    UNIQUE KEY unique_order_event (order_id, event, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Processed Orders Table (để check duplicate nhanh)
CREATE TABLE IF NOT EXISTS processed_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
