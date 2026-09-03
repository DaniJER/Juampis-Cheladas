/** Channel-agnostic outbound message shapes produced by the bot engine. */

export interface ReplyButton {
  /** <= 256 chars. Echoed back by WhatsApp as the interactive reply id. */
  id: string;
  /** <= 20 chars. */
  title: string;
}

export interface ListRow {
  id: string;
  title: string; // <= 24 chars
  description?: string; // <= 72 chars
}

export interface ListSection {
  title: string; // <= 24 chars
  rows: ListRow[];
}

export interface TextMessage {
  kind: 'text';
  body: string;
}

export interface ButtonsMessage {
  kind: 'buttons';
  body: string;
  header?: string;
  footer?: string;
  buttons: ReplyButton[]; // 1..3
}

export interface ListMessage {
  kind: 'list';
  body: string;
  header?: string;
  footer?: string;
  button: string; // <= 20 chars, the text that opens the list
  sections: ListSection[];
}

export type OutboundMessage = TextMessage | ButtonsMessage | ListMessage;

export const text = (body: string): TextMessage => ({ kind: 'text', body });
