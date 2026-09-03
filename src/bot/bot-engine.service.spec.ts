import { BotConfigService } from './bot-config.service';
import { BotEngineService } from './bot-engine.service';
import { BotState, OrderDraft, emptyDraft } from './bot-engine.types';

describe('BotEngineService', () => {
  let engine: BotEngineService;
  let cfg: BotConfigService;

  beforeAll(() => {
    cfg = new BotConfigService();
    cfg.reload(); // loads src/bot/bot-config.json
    engine = new BotEngineService(cfg);
  });

  it('greets and shows the menu from START', () => {
    const r = engine.handle(BotState.START, emptyDraft(), { text: 'hola' });
    expect(r.nextState).toBe(BotState.MENU);
    expect(r.replies.some((m) => m.kind === 'list')).toBe(true);
  });

  it('answers an FAQ without leaving the menu', () => {
    const r = engine.handle(BotState.MENU, emptyDraft(), {
      text: '¿cuál es la ubicación?',
    });
    expect(r.nextState).toBe(BotState.MENU);
    expect(r.replies[0].kind).toBe('text');
    expect((r.replies[0] as { body: string }).body.toLowerCase()).toContain('cali');
  });

  it('walks a full order to confirmation and emits the order', () => {
    let draft: OrderDraft = emptyDraft();

    let r = engine.handle(BotState.MENU, draft, { text: '', replyId: 'mojito' });
    expect(r.nextState).toBe(BotState.QUANTITY);
    draft = r.draft;

    r = engine.handle(BotState.QUANTITY, draft, { text: '2' });
    expect(r.nextState).toBe(BotState.ADD_MORE);
    expect(r.draft.items).toHaveLength(1);
    expect(r.draft.items[0]).toMatchObject({ productId: 'mojito', quantity: 2 });
    draft = r.draft;

    r = engine.handle(BotState.ADD_MORE, draft, { text: '', replyId: 'checkout' });
    expect(r.nextState).toBe(BotState.ADDRESS);
    draft = r.draft;

    r = engine.handle(BotState.ADDRESS, draft, {
      text: 'Calle 5 # 10-20, barrio San Fernando',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    draft = r.draft;

    r = engine.handle(BotState.CONFIRM, draft, { text: '', replyId: 'confirm' });
    expect(r.nextState).toBe(BotState.START);
    expect(r.order).toBeDefined();
    expect(r.order!.items).toHaveLength(1);
    const mojito = cfg.findProduct('mojito')!;
    expect(r.order!.itemsTotal).toBe(mojito.price * 2);
    expect(r.order!.total).toBe(mojito.price * 2 + cfg.get().deliveryFee);
  });

  it('rejects an invalid quantity', () => {
    const draft: OrderDraft = { items: [], pendingProductId: 'mojito' };
    const r = engine.handle(BotState.QUANTITY, draft, { text: 'muchos' });
    expect(r.nextState).toBe(BotState.QUANTITY);
    expect(r.draft.items).toHaveLength(0);
  });

  it('cancels from any state', () => {
    const draft: OrderDraft = { items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 100, quantity: 1 }] };
    const r = engine.handle(BotState.ADDRESS, draft, { text: 'cancelar' });
    expect(r.nextState).toBe(BotState.START);
    expect(r.draft.items).toHaveLength(0);
  });
});
