import { OrderStatus } from '@prisma/client';

/** bot-config.json message key to send the customer when an order moves to
 *  this status. No entry (e.g. DELIVERED) means no message is sent. */
export const STATUS_MESSAGE_KEY: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'statusAccepted',
  PREPARING: 'statusPreparing',
  READY: 'statusReady',
  DISPATCHED: 'statusDispatched',
  CANCELLED: 'statusCancelledByStaff',
};
