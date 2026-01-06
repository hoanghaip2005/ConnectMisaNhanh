/**
 * Webhook Types for Nhanh.vn Integration
 * Defines webhook event payloads and handler interfaces
 */

/**
 * Webhook event types from Nhanh.vn
 */
export enum WebhookEventType {
    ORDER_CREATED = 'order.created',
    ORDER_UPDATED = 'order.updated',
    ORDER_CANCELLED = 'order.cancelled',
    ORDER_CONFIRMED = 'order.confirmed',
    ORDER_PACKED = 'order.packed',
    ORDER_SHIPPED = 'order.shipped',
    ORDER_DELIVERED = 'order.delivered',
}

/**
 * Base webhook payload structure from Nhanh.vn
 */
export interface WebhookPayload {
    event: string;                    // Event type (e.g., "order.created")
    businessId: number;               // Business ID
    timestamp: number;                // Unix timestamp
    data: WebhookEventData;           // Event-specific data
    signature?: string;               // Security signature (if configured)
}

/**
 * Event data for order-related webhooks
 */
export interface WebhookEventData {
    orderId: number;                  // Order ID in Nhanh.vn
    status?: number;                  // New order status
    previousStatus?: number;          // Previous status (for updates)
    saleChannel?: number;             // Sale channel ID
    customerId?: number;              // Customer ID
    totalAmount?: number;             // Order total amount
    [key: string]: any;               // Allow additional fields
}

/**
 * Webhook handler response
 */
export interface WebhookResponse {
    success: boolean;
    message?: string;
    processedAt?: string;
    error?: string;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
    enabled: boolean;
    verifySignature: boolean;
    secretKey?: string;
    allowedEvents: WebhookEventType[];
}
