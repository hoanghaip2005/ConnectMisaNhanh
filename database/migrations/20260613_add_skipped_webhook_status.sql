ALTER TABLE webhook_queue
    MODIFY status ENUM('pending', 'processing', 'completed', 'failed', 'skipped') DEFAULT 'pending';
