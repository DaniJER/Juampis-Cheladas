import { Injectable } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { MenuItem } from './bot-config.schema';
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

@Injectable()
export class BotEngineService {
  constructor(private readonly cfg: BotConfigService) {}

  handle(
    state: BotStateValue,
    draftInput: OrderDraft | null | undefined,
    input: EngineInput,
  ): EngineResult {
    const draft: OrderDraft = draftInput
      ? { items: [...draftInput.items], address: draftInput.address, pendingProductId: draftInput.pendingProductId }
      : emptyDraft();
    const norm = normalize(input.text);

    // ---- Global commands (work from any state) ----
    if (CANCEL_WORDS.includes(norm)) {
      return {
        nextState: BotState.START,
        draft: emptyDraft(),
        replies: [text(this.cfg.message('orderCancelled')), ...this.welcome()],
      };
    }
    if (state === BotState.START || RESTART_WORDS.includes(norm)) {
      return { nextState: BotState.MENU, draft, replies: this.welcome() };
    }

    switch (state) {
      case BotState.MENU:
        return this.handleMenu(draft, input, norm);
      case BotState.QUANTITY:
        return this.handleQuantity(draft, norm);
      case BotState.ADD_MORE:
        return this.handleAddMore(draft, input, norm);
      case BotState.ADDRESS:
        return this.handleAddress(draft, input.text);
      case BotState.CONFIRM:
        return this.handleConfirm(draft, input, norm);
      default:
        return { nextState: BotState.MENU, draft, replies: this.welcome() };
    }
  }

  // ---------------------------------------------------------------------------

  private handleMenu(draft: OrderDraft, input: EngineInput, norm: string): EngineResult {
    const product = this.resolveProduct(input.replyId, norm);

    if (!product) {
      const faq = this.faqAnswer(norm);
      if (faq) {
        return { nextState: BotState.MENU, draft, replies: [text(faq)] };
      }
      return {
        nextState: BotState.MENU,
        draft,
        replies: [text(this.cfg.message('fallback')), this.menuList()],
      };
    }

    if (!product.available) {
      return {
        nextState: BotState.MENU,
        draft,
        replies: [text(this.cfg.message('productUnavailable')), this.menuList()],
      };
    }

    draft.pendingProductId = product.id;
    return {
      nextState: BotState.QUANTITY,
      draft,
      replies: [text(this.cfg.message('askQuantity', { product: product.name }))],
    };
  }

  private handleQuantity(draft: OrderDraft, norm: string): EngineResult {
    const qty = this.parseQuantity(norm);
    const product = draft.pendingProductId
      ? this.cfg.findProduct(draft.pendingProductId)
      : undefined;

    if (!qty || !product) {
      return {
        nextState: BotState.QUANTITY,
        draft,
        replies: [text(this.cfg.message('invalidQuantity'))],
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
      replies: [
        {
          kind: 'buttons',
          body: this.cfg.message('addMore'),
          buttons: [
            { id: 'add_more', title: 'Agregar otro' },
            { id: 'checkout', title: 'Finalizar' },
          ],
        },
      ],
    };
  }

  private handleAddMore(draft: OrderDraft, input: EngineInput, norm: string): EngineResult {
    const wantsMore =
      input.replyId === 'add_more' || YES_WORDS.includes(norm) || norm.includes('agregar');
    const wantsCheckout =
      input.replyId === 'checkout' || NO_WORDS.includes(norm) || norm.includes('finaliz');

    if (wantsMore) {
      return { nextState: BotState.MENU, draft, replies: [this.menuList()] };
    }
    if (wantsCheckout) {
      return {
        nextState: BotState.ADDRESS,
        draft,
        replies: [text(this.cfg.message('askAddress'))],
      };
    }
    return {
      nextState: BotState.ADD_MORE,
      draft,
      replies: [
        {
          kind: 'buttons',
          body: this.cfg.message('addMore'),
          buttons: [
            { id: 'add_more', title: 'Agregar otro' },
            { id: 'checkout', title: 'Finalizar' },
          ],
        },
      ],
    };
  }

  private handleAddress(draft: OrderDraft, rawText: string): EngineResult {
    const address = rawText.trim();
    if (address.length < 6) {
      return {
        nextState: BotState.ADDRESS,
        draft,
        replies: [text(this.cfg.message('askAddress'))],
      };
    }
    draft.address = address;
    return {
      nextState: BotState.CONFIRM,
      draft,
      replies: [
        {
          kind: 'buttons',
          header: this.cfg.message('confirmHeader'),
          body: this.summary(draft),
          footer: this.cfg.message('confirmFooter'),
          buttons: [
            { id: 'confirm', title: 'Confirmar' },
            { id: 'cancel', title: 'Cancelar' },
          ],
        },
      ],
    };
  }

  private handleConfirm(draft: OrderDraft, input: EngineInput, norm: string): EngineResult {
    const confirmed = input.replyId === 'confirm' || YES_WORDS.includes(norm);
    const cancelled = input.replyId === 'cancel' || NO_WORDS.includes(norm);

    if (cancelled) {
      return {
        nextState: BotState.START,
        draft: emptyDraft(),
        replies: [text(this.cfg.message('orderCancelled'))],
      };
    }
    if (!confirmed || !draft.address || draft.items.length === 0) {
      return {
        nextState: BotState.CONFIRM,
        draft,
        replies: [
          {
            kind: 'buttons',
            header: this.cfg.message('confirmHeader'),
            body: this.summary(draft),
            footer: this.cfg.message('confirmFooter'),
            buttons: [
              { id: 'confirm', title: 'Confirmar' },
              { id: 'cancel', title: 'Cancelar' },
            ],
          },
        ],
      };
    }

    const itemsTotal = this.itemsTotal(draft.items);
    const deliveryFee = this.cfg.get().deliveryFee;
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

  private welcome(): OutboundMessage[] {
    return [text(this.cfg.message('welcome')), this.menuList()];
  }

  private menuList(): OutboundMessage {
    return {
      kind: 'list',
      header: this.cfg.message('menuHeader'),
      body: 'Selecciona un coctel para agregarlo a tu pedido 👇',
      button: 'Ver carta',
      sections: [
        {
          title: 'Cocteles',
          rows: this.cfg.availableMenu().map((m) => ({
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

  private summary(draft: OrderDraft): string {
    const lines = draft.items.map(
      (it) => `• ${it.quantity} x ${it.name} — $${this.money(it.unitPrice * it.quantity)}`,
    );
    const itemsTotal = this.itemsTotal(draft.items);
    const deliveryFee = this.cfg.get().deliveryFee;
    lines.push('');
    lines.push(`Subtotal: $${this.money(itemsTotal)}`);
    if (deliveryFee > 0) lines.push(`Domicilio: $${this.money(deliveryFee)}`);
    lines.push(`*Total: $${this.money(itemsTotal + deliveryFee)}*`);
    lines.push('');
    lines.push(`Dirección: ${draft.address ?? '-'}`);
    return lines.join('\n');
  }

  private resolveProduct(replyId: string | undefined, norm: string): MenuItem | undefined {
    if (replyId) {
      const byId = this.cfg.findProduct(replyId);
      if (byId) return byId;
    }
    if (!norm) return undefined;
    // exact name match
    const byName = this.cfg.menu.find((m) => normalize(m.name) === norm);
    if (byName) return byName;
    // "1", "2"... positional against the available menu
    const asIndex = parseInt(norm, 10);
    const available = this.cfg.availableMenu();
    if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= available.length) {
      return available[asIndex - 1];
    }
    // loose contains match on a distinctive word
    return this.cfg.menu.find(
      (m) => norm.length >= 3 && normalize(m.name).includes(norm),
    );
  }

  private parseQuantity(norm: string): number | null {
    const n = parseInt(norm.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(n) || n < 1 || n > MAX_QTY) return null;
    return n;
  }

  private faqAnswer(norm: string): string | null {
    if (!norm) return null;
    for (const faq of this.cfg.get().faqs) {
      if (faq.keywords.some((k) => norm.includes(normalize(k)))) {
        return this.cfg.interpolate(faq.answer);
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
