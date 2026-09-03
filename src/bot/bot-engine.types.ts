import { OutboundMessage } from './outbound';

export const BotState = {
  START: 'START',
  MENU: 'MENU',
  QUANTITY: 'QUANTITY',
  ADD_MORE: 'ADD_MORE',
  ADDRESS: 'ADDRESS',
  CONFIRM: 'CONFIRM',
} as const;

export type BotStateValue = (typeof BotState)[keyof typeof BotState];

export interface DraftItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface OrderDraft {
  items: DraftItem[];
  address?: string;
  /** Product chosen but still awaiting a quantity. */
  pendingProductId?: string;
}

export const emptyDraft = (): OrderDraft => ({ items: [] });

/** What the engine understood from an inbound WhatsApp message. */
export interface EngineInput {
  /** Free text body, trimmed. Empty string if the message had no text. */
  text: string;
  /** id of a tapped button / list row, if the message was interactive. */
  replyId?: string;
}

export interface EngineOrder {
  items: DraftItem[];
  address: string;
  itemsTotal: number;
  deliveryFee: number;
  total: number;
}

export interface EngineResult {
  nextState: BotStateValue;
  draft: OrderDraft;
  replies: OutboundMessage[];
  /** Present only on the turn the customer confirms: persist + dispatch this. */
  order?: EngineOrder;
}
