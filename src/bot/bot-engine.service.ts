import { Injectable } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { DeliveryZone, MenuItem } from './bot-config.schema';
import { OutboundMessage, text } from './outbound';
import {
  BotState,
  BotStateValue,
  DraftItem,
  EngineInput,
  EngineResult,
  OrderDraft,
  emptyDraft,
} from './bot-engine.types';

const MAX_QTY = 20;

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .trim();
}

const RESTART_WORDS = ['hola', 'menu', 'inicio', 'empezar', 'buenas', 'start'];
const CANCEL_WORDS = ['cancelar', 'cancela', 'salir'];
const YES_WORDS = ['si', 'sí', 'sip', 'claro', 'dale', 'confirmar', 'confirmo', 'ok', 'listo'];
const NO_WORDS = ['no', 'nop', 'nel', 'finalizar', 'terminar'];

// Phrases that mean "show me the menu / the prices" mid-conversation.
// (The bare word "menu" is already handled by RESTART_WORDS.)
const MENU_WORDS = [
  'carta',
  'menu',
  'la lista',
  'que venden',
  'que tienen',
  'que ofrecen',
  'que hay',
  'que cocteles',
  'que coctel',
  'que tragos',
  'que bebidas',
  'opciones',
  'precios',
  'lista de precios',
  'catalogo',
];

// Phrases that mean "how much is my order so far, delivery included".
const TOTAL_WORDS = [
  'cuanto llevo',
  'cuanto voy',
  'cuanto va mi',
  'cuanto va el pedido',
  'mi total',
  'total del pedido',
  'total de mi',
  'cuanto me sale',
  'cuanto sale',
  'cuanto seria',
  'cuanto es en total',
  'cuanto vale mi',
  'valor del pedido',
  'valor total',
  'cuanto pago',
  'cuanto debo',
  'con domicilio cuanto',
  'sumando el domicilio',
];

@Injectable()
export class BotEngineService {
  constructor(private readonly cfg: BotConfigService) {}

  handle(
    businessId: string,
    state: BotStateValue,
    draftInput: OrderDraft | null | undefined,
    input: EngineInput,
  ): EngineResult {
    const draft: OrderDraft = draftInput
      ? {
          items: [...draftInput.items],
          address: draftInput.address,
          barrio: draftInput.barrio,
          deliveryFee: draftInput.deliveryFee,
          rain: draftInput.rain,
          pendingProductId: draftInput.pendingProductId,
        }
      : emptyDraft();
    const norm = normalize(input.text);

    // ---- Global commands (work from any state) ----
    if (CANCEL_WORDS.includes(norm)) {
      return {
        nextState: BotState.START,
        draft: emptyDraft(),
        replies: [text(this.cfg.message(businessId, 'orderCancelled')), ...this.welcome(businessId)],
      };
    }
    if (state === BotState.START || RESTART_WORDS.includes(norm)) {
      return { nextState: BotState.MENU, draft, replies: this.welcome(businessId) };
    }

    // ---- Info questions (menu, running total, location, hours, payment...) ----
    // Answered from any state without advancing the flow. In ADDRESS the user
    // is typing a free-form address, so only the specific menu/total phrases
    // are honored there — the looser FAQ keywords (e.g. "local") would clash.
    const info = this.infoReplies(businessId, norm, draft, state !== BotState.ADDRESS);
    if (info) {
      return {
        nextState: state,
        draft,
        replies: [...info, ...this.currentPrompt(businessId, state, draft)],
      };
    }

    switch (state) {
      case BotState.MENU:
        return this.handleMenu(businessId, draft, input, norm);
      case BotState.QUANTITY:
        return this.handleQuantity(businessId, draft, norm);
      case BotState.ADD_MORE:
        return this.handleAddMore(businessId, draft, input, norm);
      case BotState.ADDRESS:
        return this.handleAddress(businessId, draft, input, norm);
      case BotState.CONFIRM:
        return this.handleConfirm(businessId, draft, input, norm);
      default:
        return { nextState: BotState.MENU, draft, replies: this.welcome(businessId) };
    }
  }

  // ---------------------------------------------------------------------------

  private handleMenu(
    businessId: string,
    draft: OrderDraft,
    input: EngineInput,
    norm: string,
  ): EngineResult {
    const product = this.resolveProduct(businessId, input.replyId, norm);

    if (!product) {
      // Menu / total / FAQ questions were already handled in handle().
      return {
        nextState: BotState.MENU,
        draft,
        replies: [text(this.cfg.message(businessId, 'fallback')), this.menuList(businessId)],
      };
    }

    if (!product.available) {
      return {
        nextState: BotState.MENU,
        draft,
        replies: [
          text(this.cfg.message(businessId, 'productUnavailable')),
          this.menuList(businessId),
        ],
      };
    }

    draft.pendingProductId = product.id;
    return {
      nextState: BotState.QUANTITY,
      draft,
      replies: [text(this.cfg.message(businessId, 'askQuantity', { product: product.name }))],
    };
  }

  private handleQuantity(businessId: string, draft: OrderDraft, norm: string): EngineResult {
    const qty = this.parseQuantity(norm);
    const product = draft.pendingProductId
      ? this.cfg.findProduct(businessId, draft.pendingProductId)
      : undefined;

    if (!qty || !product) {
      return {
        nextState: BotState.QUANTITY,
        draft,
        replies: [text(this.cfg.message(businessId, 'invalidQuantity'))],
      };
    }

    draft.items.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: qty,
    });
    draft.pendingProductId = undefined;

    return {
      nextState: BotState.ADD_MORE,
      draft,
      replies: [this.addMoreButtons(businessId)],
    };
  }

  private handleAddMore(
    businessId: string,
    draft: OrderDraft,
    input: EngineInput,
    norm: string,
  ): EngineResult {
    const wantsMore =
      input.replyId === 'add_more' || YES_WORDS.includes(norm) || norm.includes('agregar');
    const wantsCheckout =
      input.replyId === 'checkout' || NO_WORDS.includes(norm) || norm.includes('finaliz');

    if (wantsMore) {
      return { nextState: BotState.MENU, draft, replies: [this.menuList(businessId)] };
    }
    if (wantsCheckout) {
      return {
        nextState: BotState.ADDRESS,
        draft,
        replies: [text(this.cfg.message(businessId, 'askAddress'))],
      };
    }
    return {
      nextState: BotState.ADD_MORE,
      draft,
      replies: [this.addMoreButtons(businessId)],
    };
  }

  private handleAddress(
    businessId: string,
    draft: OrderDraft,
    input: EngineInput,
    norm: string,
  ): EngineResult {
    // Barrio chosen from the picker list.
    if (input.replyId?.startsWith('zona:')) {
      const zone = this.findZone(businessId, input.replyId.slice('zona:'.length));
      if (zone) {
        draft.barrio = zone.name;
        this.priceDelivery(businessId, draft, this.zoneFee(businessId, zone), input.raining);
        return {
          nextState: BotState.CONFIRM,
          draft,
          replies: [this.confirmButtons(businessId, draft)],
        };
      }
    }

    const incoming = input.text.trim();
    if (!draft.address && incoming.length < 6) {
      return {
        nextState: BotState.ADDRESS,
        draft,
        replies: [text(this.cfg.message(businessId, 'askAddress'))],
      };
    }
    if (incoming.length >= 6) draft.address = incoming;

    // Identify the barrio from the address text (or a re-typed barrio name).
    const zone = this.resolveZone(businessId, norm);
    if (zone) {
      draft.barrio = zone.name;
      this.priceDelivery(businessId, draft, this.zoneFee(businessId, zone), input.raining);
      return {
        nextState: BotState.CONFIRM,
        draft,
        replies: [this.confirmButtons(businessId, draft)],
      };
    }

    // Barrio not recognized: ask for it with a list if we have zones,
    // otherwise charge the flat fallback fee and move on.
    if (this.cfg.get(businessId).delivery.zones.length > 0) {
      return {
        nextState: BotState.ADDRESS,
        draft,
        replies: [this.barrioPicker(businessId)],
      };
    }
    this.priceDelivery(businessId, draft, this.cfg.get(businessId).delivery.fallbackFee, input.raining);
    return {
      nextState: BotState.CONFIRM,
      draft,
      replies: [this.confirmButtons(businessId, draft)],
    };
  }

  private handleConfirm(
    businessId: string,
    draft: OrderDraft,
    input: EngineInput,
    norm: string,
  ): EngineResult {
    const confirmed = input.replyId === 'confirm' || YES_WORDS.includes(norm);
    const cancelled = input.replyId === 'cancel' || NO_WORDS.includes(norm);

    if (cancelled) {
      return {
        nextState: BotState.START,
        draft: emptyDraft(),
        replies: [text(this.cfg.message(businessId, 'orderCancelled'))],
      };
    }
    if (!confirmed || !draft.address || draft.items.length === 0) {
      return {
        nextState: BotState.CONFIRM,
        draft,
        replies: [this.confirmButtons(businessId, draft)],
      };
    }

    const itemsTotal = this.itemsTotal(draft.items);
    const deliveryFee = this.deliveryFee(businessId, draft);
    return {
      nextState: BotState.START,
      draft: emptyDraft(),
      replies: [], // orderPlaced text is sent by the orchestrator once it has the #code
      order: {
        items: draft.items,
        address: draft.address,
        itemsTotal,
        deliveryFee,
        total: itemsTotal + deliveryFee,
      },
    };
  }

  // ---------------------------------------------------------------------------

  private welcome(businessId: string): OutboundMessage[] {
    return [text(this.cfg.message(businessId, 'welcome')), this.menuList(businessId)];
  }

  private menuList(businessId: string): OutboundMessage {
    return {
      kind: 'list',
      header: this.cfg.message(businessId, 'menuHeader'),
      body: 'Selecciona un coctel para agregarlo a tu pedido 👇',
      button: 'Ver carta',
      sections: [
        {
          title: 'Cocteles',
          rows: this.cfg.availableMenu(businessId).map((m) => ({
            id: m.id,
            title: this.truncate(m.name, 24),
            description: this.truncate(
              `$${this.money(m.price)}${m.description ? ` · ${m.description}` : ''}`,
              72,
            ),
          })),
        },
      ],
    };
  }

  private addMoreButtons(businessId: string): OutboundMessage {
    return {
      kind: 'buttons',
      body: this.cfg.message(businessId, 'addMore'),
      buttons: [
        { id: 'add_more', title: 'Agregar otro' },
        { id: 'checkout', title: 'Finalizar' },
      ],
    };
  }

  private confirmButtons(businessId: string, draft: OrderDraft): OutboundMessage {
    return {
      kind: 'buttons',
      header: this.cfg.message(businessId, 'confirmHeader'),
      body: this.summary(businessId, draft),
      footer: this.cfg.message(businessId, 'confirmFooter'),
      buttons: [
        { id: 'confirm', title: 'Confirmar' },
        { id: 'cancel', title: 'Cancelar' },
      ],
    };
  }

  /** Answer to menu / running-total / FAQ questions, or null if none matched. */
  private infoReplies(
    businessId: string,
    norm: string,
    draft: OrderDraft,
    allowFaq: boolean,
  ): OutboundMessage[] | null {
    if (!norm) return null;
    if (TOTAL_WORDS.some((w) => norm.includes(w))) {
      return [text(this.runningTotal(businessId, draft))];
    }
    if (MENU_WORDS.some((w) => norm.includes(w))) {
      return [text(this.cfg.message(businessId, 'menuHere')), this.menuList(businessId)];
    }
    if (allowFaq) {
      const faq = this.faqAnswer(businessId, norm);
      if (faq) return [text(faq)];
    }
    return null;
  }

  /** The prompt to repeat after answering a mid-flow question, so the
   *  customer still sees what to do next. Menu is noisy to repeat, so skip it. */
  private currentPrompt(
    businessId: string,
    state: BotStateValue,
    draft: OrderDraft,
  ): OutboundMessage[] {
    switch (state) {
      case BotState.QUANTITY: {
        const p = draft.pendingProductId
          ? this.cfg.findProduct(businessId, draft.pendingProductId)
          : undefined;
        return p
          ? [text(this.cfg.message(businessId, 'askQuantity', { product: p.name }))]
          : [];
      }
      case BotState.ADD_MORE:
        return [this.addMoreButtons(businessId)];
      case BotState.CONFIRM:
        return [this.confirmButtons(businessId, draft)];
      default:
        return [];
    }
  }

  /** Running cost of the draft (items + delivery), for mid-order questions. */
  private runningTotal(businessId: string, draft: OrderDraft): string {
    if (draft.items.length === 0) return this.cfg.message(businessId, 'cartEmpty');
    return [this.cfg.message(businessId, 'cartHeader'), ...this.priceLines(businessId, draft)].join(
      '\n',
    );
  }

  /** Item lines + subtotal + delivery + total. Shared by the summary and the
   *  running-total answer. */
  private priceLines(businessId: string, draft: OrderDraft): string[] {
    const lines = draft.items.map(
      (it) => `• ${it.quantity} x ${it.name} — $${this.money(it.unitPrice * it.quantity)}`,
    );
    const itemsTotal = this.itemsTotal(draft.items);
    const deliveryFee = this.deliveryFee(businessId, draft);
    lines.push('');
    lines.push(`Subtotal: $${this.money(itemsTotal)}`);
    if (deliveryFee > 0) {
      const parts = [draft.barrio, draft.rain ? '+lluvia ☔' : undefined].filter(Boolean);
      const label = parts.length ? `Domicilio (${parts.join(' · ')})` : 'Domicilio';
      lines.push(`${label}: $${this.money(deliveryFee)}`);
    }
    lines.push(`*Total: $${this.money(itemsTotal + deliveryFee)}*`);
    return lines;
  }

  private summary(businessId: string, draft: OrderDraft): string {
    const lines = this.priceLines(businessId, draft);
    lines.push('');
    lines.push(`Dirección: ${draft.address ?? '-'}`);
    return lines.join('\n');
  }

  // ---- Delivery zones -------------------------------------------------------

  /** Base charge for a zone: the precomputed `fee`, or `ceil(km) * ratePerKm`. */
  private zoneFee(businessId: string, zone: DeliveryZone): number {
    return zone.fee || Math.ceil(zone.km) * this.cfg.get(businessId).delivery.ratePerKm;
  }

  /** Store the delivery fee on the draft, applying the rain surcharge (a
   *  multiplier on the base fee, rounded up to $500) when it's raining. */
  private priceDelivery(
    businessId: string,
    draft: OrderDraft,
    base: number,
    raining: boolean | undefined,
  ): void {
    const mult = this.cfg.get(businessId).delivery.rain.multiplier;
    if (raining && mult > 1) {
      draft.deliveryFee = Math.ceil((base * mult) / 500) * 500;
      draft.rain = true;
    } else {
      draft.deliveryFee = base;
      draft.rain = false;
    }
  }

  /** Delivery charge for the draft, or the flat fallback if no barrio yet. */
  private deliveryFee(businessId: string, draft: OrderDraft): number {
    return draft.deliveryFee ?? this.cfg.get(businessId).delivery.fallbackFee;
  }

  /** Find a zone whose name or an alias appears in the normalized text. */
  private resolveZone(businessId: string, norm: string): DeliveryZone | undefined {
    if (!norm) return undefined;
    return this.cfg.get(businessId).delivery.zones.find((z) =>
      [z.name, ...z.aliases].some((label) => {
        const n = normalize(label);
        return n.length >= 3 && norm.includes(n);
      }),
    );
  }

  private findZone(businessId: string, name: string): DeliveryZone | undefined {
    const n = normalize(name);
    return this.cfg.get(businessId).delivery.zones.find((z) => normalize(z.name) === n);
  }

  private barrioPicker(businessId: string): OutboundMessage {
    const rows = this.cfg.get(businessId).delivery.zones.map((z) => ({
      id: `zona:${z.name}`,
      title: this.truncate(z.name, 24),
      description: this.truncate(`$${this.money(this.zoneFee(businessId, z))} · ${z.km} km`, 72),
    }));
    // WhatsApp lists allow at most 10 rows per section.
    const sections: { title: string; rows: typeof rows }[] = [];
    for (let i = 0; i < rows.length; i += 10) {
      sections.push({
        title: `Barrios ${i + 1}-${Math.min(i + 10, rows.length)}`,
        rows: rows.slice(i, i + 10),
      });
    }
    return {
      kind: 'list',
      header: this.cfg.message(businessId, 'barrioListHeader'),
      body: this.cfg.message(businessId, 'askBarrio'),
      button: this.cfg.message(businessId, 'barrioListButton'),
      sections,
    };
  }

  private resolveProduct(
    businessId: string,
    replyId: string | undefined,
    norm: string,
  ): MenuItem | undefined {
    if (replyId) {
      const byId = this.cfg.findProduct(businessId, replyId);
      if (byId) return byId;
    }
    if (!norm) return undefined;
    // exact name match
    const byName = this.cfg.menu(businessId).find((m) => normalize(m.name) === norm);
    if (byName) return byName;
    // "1", "2"... positional against the available menu
    const asIndex = parseInt(norm, 10);
    const available = this.cfg.availableMenu(businessId);
    if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= available.length) {
      return available[asIndex - 1];
    }
    // loose contains match on a distinctive word
    return this.cfg
      .menu(businessId)
      .find((m) => norm.length >= 3 && normalize(m.name).includes(norm));
  }

  private parseQuantity(norm: string): number | null {
    const n = parseInt(norm.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(n) || n < 1 || n > MAX_QTY) return null;
    return n;
  }

  private faqAnswer(businessId: string, norm: string): string | null {
    if (!norm) return null;
    for (const faq of this.cfg.get(businessId).faqs) {
      if (faq.keywords.some((k) => norm.includes(normalize(k)))) {
        return this.cfg.interpolate(businessId, faq.answer);
      }
    }
    return null;
  }

  private itemsTotal(items: DraftItem[]): number {
    return items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  }

  private money(value: number): string {
    return value.toLocaleString('es-CO');
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  }
}
