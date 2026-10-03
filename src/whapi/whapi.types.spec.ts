import { parseWebhook, WhapiWebhookBody } from './whapi.types';

describe('parseWebhook (Whapi)', () => {
  it('normalizes an incoming text message', () => {
    const body: WhapiWebhookBody = {
      event: { type: 'messages', event: 'post' },
      messages: [
        {
          id: 'wamid.ABC',
          from_me: false,
          type: 'text',
          chat_id: '573001112233@s.whatsapp.net',
          from: '573001112233',
          from_name: 'Juampi',
          text: { body: 'hola' },
        },
      ],
    };

    expect(parseWebhook(body)).toEqual([
      {
        messageId: 'wamid.ABC',
        from: '573001112233',
        contactName: 'Juampi',
        text: 'hola',
        replyId: undefined,
        type: 'text',
      },
    ]);
  });

  it('strips the ButtonsV3 prefix from a button reply id', () => {
    const body: WhapiWebhookBody = {
      messages: [
        {
          id: 'wamid.DEF',
          from_me: false,
          type: 'reply',
          from: '573001112233',
          reply: {
            type: 'buttons_reply',
            buttons_reply: { id: 'ButtonsV3:ord:42:ACCEPT', title: 'Aceptar' },
          },
        },
      ],
    };

    const [msg] = parseWebhook(body);
    expect(msg.replyId).toBe('ord:42:ACCEPT');
    expect(msg.text).toBe('Aceptar');
  });

  it('keeps an unprefixed list reply id as-is', () => {
    const body: WhapiWebhookBody = {
      messages: [
        {
          id: 'wamid.GHI',
          from_me: false,
          type: 'reply',
          from: '573001112233',
          reply: {
            type: 'list_reply',
            list_reply: { id: 'qty:5', title: '5' },
          },
        },
      ],
    };

    expect(parseWebhook(body)[0].replyId).toBe('qty:5');
  });

  it('ignores messages we sent ourselves', () => {
    const body: WhapiWebhookBody = {
      messages: [
        { id: 'x', from_me: true, type: 'text', from: '573001112233' },
      ],
    };
    expect(parseWebhook(body)).toEqual([]);
  });

  it('ignores non-message events (statuses, acks, ...)', () => {
    const body: WhapiWebhookBody = {
      event: { type: 'statuses', event: 'post' },
      messages: [
        { id: 'x', from_me: false, type: 'text', from: '1', text: { body: 'hi' } },
      ],
    };
    expect(parseWebhook(body)).toEqual([]);
  });
});
