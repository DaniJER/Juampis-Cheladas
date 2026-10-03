import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfigService } from './bot-config.service';
import { BotEngineService } from './bot-engine.service';
import { BotState, OrderDraft, emptyDraft } from './bot-engine.types';

const BUSINESS_ID = 'test-business';

describe('BotEngineService', () => {
  let engine: BotEngineService;
  let cfg: BotConfigService;

  beforeAll(() => {
    cfg = new BotConfigService({} as PrismaService);
    const raw = JSON.parse(readFileSync(join(__dirname, 'bot-config.json'), 'utf-8'));
    cfg.loadFromObject(BUSINESS_ID, raw); // loads src/bot/bot-config.json
    engine = new BotEngineService(cfg);
  });

  it('greets and shows the menu from START', () => {
    const r = engine.handle(BUSINESS_ID, BotState.START, emptyDraft(), { text: 'hola' });
    expect(r.nextState).toBe(BotState.MENU);
    expect(r.replies.some((m) => m.kind === 'list')).toBe(true);
  });

  it('answers an FAQ without leaving the menu', () => {
    const r = engine.handle(BUSINESS_ID, BotState.MENU, emptyDraft(), {
      text: '¿cuál es la ubicación?',
    });
    expect(r.nextState).toBe(BotState.MENU);
    expect(r.replies[0].kind).toBe('text');
    expect((r.replies[0] as { body: string }).body.toLowerCase()).toContain('cali');
  });

  it('walks a full order to confirmation and emits the order', () => {
    let draft: OrderDraft = emptyDraft();

    let r = engine.handle(BUSINESS_ID, BotState.MENU, draft, { text: '', replyId: 'mojito' });
    expect(r.nextState).toBe(BotState.QUANTITY);
    draft = r.draft;

    r = engine.handle(BUSINESS_ID, BotState.QUANTITY, draft, { text: '2' });
    expect(r.nextState).toBe(BotState.ADD_MORE);
    expect(r.draft.items).toHaveLength(1);
    expect(r.draft.items[0]).toMatchObject({ productId: 'mojito', quantity: 2 });
    draft = r.draft;

    r = engine.handle(BUSINESS_ID, BotState.ADD_MORE, draft, { text: '', replyId: 'checkout' });
    expect(r.nextState).toBe(BotState.ADDRESS);
    draft = r.draft;

    r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Calle 5 # 10-20, barrio San Fernando',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    expect(r.draft.barrio).toBe('San Fernando');
    draft = r.draft;

    r = engine.handle(BUSINESS_ID, BotState.CONFIRM, draft, { text: '', replyId: 'confirm' });
    expect(r.nextState).toBe(BotState.START);
    expect(r.order).toBeDefined();
    expect(r.order!.items).toHaveLength(1);
    const mojito = cfg.findProduct(BUSINESS_ID, 'mojito')!;
    const sanFernando = cfg.get(BUSINESS_ID).delivery.zones.find((z) => z.name === 'San Fernando')!;
    expect(r.order!.itemsTotal).toBe(mojito.price * 2);
    expect(r.order!.deliveryFee).toBe(sanFernando.fee);
    expect(r.order!.total).toBe(mojito.price * 2 + sanFernando.fee);
  });

  it('rejects an invalid quantity', () => {
    const draft: OrderDraft = { items: [], pendingProductId: 'mojito' };
    const r = engine.handle(BUSINESS_ID, BotState.QUANTITY, draft, { text: 'muchos' });
    expect(r.nextState).toBe(BotState.QUANTITY);
    expect(r.draft.items).toHaveLength(0);
  });

  it('shows the menu when asked mid-order, without losing the draft', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 2 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADD_MORE, draft, {
      text: '¿qué cocteles tienen?',
    });
    expect(r.nextState).toBe(BotState.ADD_MORE);
    expect(r.replies.some((m) => m.kind === 'list')).toBe(true);
    // draft untouched + the add-more buttons are shown again
    expect(r.draft.items).toHaveLength(1);
    expect(r.replies.some((m) => m.kind === 'buttons')).toBe(true);
  });

  it('answers the running total (delivery included) mid-order', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 2 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADD_MORE, draft, { text: 'cuánto llevo?' });
    expect(r.nextState).toBe(BotState.ADD_MORE);
    const body = (r.replies[0] as { body: string }).body;
    const fee = cfg.get(BUSINESS_ID).delivery.fallbackFee; // no barrio identified yet
    expect(body).toContain((30000).toLocaleString('es-CO')); // subtotal
    expect(body).toContain((30000 + fee).toLocaleString('es-CO')); // total
    expect(r.draft.items).toHaveLength(1);
  });

  it('says the cart is empty when asked for the total with nothing in it', () => {
    const r = engine.handle(BUSINESS_ID, BotState.MENU, emptyDraft(), { text: 'cuánto sale?' });
    expect(r.nextState).toBe(BotState.MENU);
    expect((r.replies[0] as { body: string }).body.toLowerCase()).toContain('todavía');
  });

  it('answers an FAQ from the CONFIRM state and re-shows the confirm prompt', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
      address: 'Calle 5 # 10-20, San Fernando',
    };
    const r = engine.handle(BUSINESS_ID, BotState.CONFIRM, draft, {
      text: '¿cuál es la dirección?',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    expect((r.replies[0] as { body: string }).body.toLowerCase()).toContain('cali');
    expect(r.replies.some((m) => m.kind === 'buttons')).toBe(true);
  });

  it('does not treat a real address as a question in the ADDRESS state', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Local 3, Centro Comercial El Dorado, barrio Centro',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    expect(r.draft.address).toContain('Centro Comercial');
  });

  it('asks for the barrio with a list when the address has none it knows', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Calle 18 # 100-30, casa esquinera portón negro',
    });
    expect(r.nextState).toBe(BotState.ADDRESS);
    expect(r.replies.some((m) => m.kind === 'list')).toBe(true);
    expect(r.draft.address).toContain('Calle 18');
    expect(r.draft.deliveryFee).toBeUndefined();
  });

  it('sets the delivery fee from the picked barrio (ceil km * ratePerKm)', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
      address: 'Calle 18 # 100-30',
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Ciudad Jardín',
      replyId: 'zona:Ciudad Jardín',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    const zone = cfg.get(BUSINESS_ID).delivery.zones.find((z) => z.name === 'Ciudad Jardín')!;
    expect(r.draft.barrio).toBe('Ciudad Jardín');
    expect(r.draft.deliveryFee).toBe(zone.fee);
    expect(Math.ceil(zone.km) * cfg.get(BUSINESS_ID).delivery.ratePerKm).toBe(zone.fee);
  });

  it('recognizes a barrio written as an alias in the address', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Av 5N # 20-10, barrio el penon',
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    expect(r.draft.barrio).toBe('El Peñón');
  });

  it('applies the rain surcharge to the delivery fee', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Calle 5 # 10-20, barrio San Fernando',
      raining: true,
    });
    expect(r.nextState).toBe(BotState.CONFIRM);
    const zone = cfg.get(BUSINESS_ID).delivery.zones.find((z) => z.name === 'San Fernando')!;
    const mult = cfg.get(BUSINESS_ID).delivery.rain.multiplier;
    const expected = Math.ceil((zone.fee * mult) / 500) * 500;
    expect(r.draft.rain).toBe(true);
    expect(r.draft.deliveryFee).toBe(expected);
    expect(r.draft.deliveryFee).toBeGreaterThan(zone.fee);
    const body = (r.replies[0] as { body: string }).body;
    expect(body.toLowerCase()).toContain('lluvia');
  });

  it('does not add the surcharge when it is not raining', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 15000, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, {
      text: 'Calle 5 # 10-20, barrio San Fernando',
      raining: false,
    });
    const zone = cfg.get(BUSINESS_ID).delivery.zones.find((z) => z.name === 'San Fernando')!;
    expect(r.draft.rain).toBe(false);
    expect(r.draft.deliveryFee).toBe(zone.fee);
  });

  it('cancels from any state', () => {
    const draft: OrderDraft = {
      items: [{ productId: 'mojito', name: 'Mojito', unitPrice: 100, quantity: 1 }],
    };
    const r = engine.handle(BUSINESS_ID, BotState.ADDRESS, draft, { text: 'cancelar' });
    expect(r.nextState).toBe(BotState.START);
    expect(r.draft.items).toHaveLength(0);
  });
});
