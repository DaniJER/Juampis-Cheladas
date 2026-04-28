import { Injectable } from '@nestjs/common';

const userStates = new Map<string, string>();
@Injectable()
export class WhatsappService {
  async sendMessage(to: string, message: string) {
    const PHONE_NUMBER_ID = '1060712690462075';
    const ACCESS_TOKEN =
      'EAANXPZBInb28BRUAgZABf23djWFtjHlinsAHV6qq4ZAP92r76MA0wn1NCEjZB6uplGJcD4GkbOZCqZAuhDZBaTObWhzKdgzJnB5rnhwmnVraMy7dkaGYzBmfXWSgndiJDtZAHoJqjZCSrzf2nwkgP6MmfQmEnzWz1iLZBl57ZCqHPAFdaOXZCFQ2j96md6c91oryoMlqGXqwZAWoYV4XIr6VIDTEx8CE4ZAZCUzwydfv7D8m6XIGzMziXjKthUvLY1tWsCSOzjcEKuIpGLeSarzDEOvzP2wAq2UCl1xZC1ISUDgZD';

    await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          text: { body: message },
        }),
      },
    );
  }
  async processMessage(body: any) {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const text = message.text?.body;

    let state = userStates.get(from) || 'START';

    switch (state) {
      case 'START':
        userStates.set(from, 'MENU');
        return this.sendMessage(
          from,
          '🍹 Bienvenido a Juampis Cheladas\n\n1. Ver menú\n2. Hacer pedido\n3. ¿Cuál es la ubicación de Juampis Cheladas?',
        );

      case 'MENU':
        if (text === '1' || text === '2') {
          userStates.set(from, 'PRODUCT');
          return this.sendMessage(
            from,
            'Elige tu coctel:\n1. Mojito\n2. Margarita\n3. Piña Colada',
          );
        }
        return this.sendMessage(from, 'Por favor elige 1 o 2');

      case 'PRODUCT':
        userStates.set(from, 'QUANTITY');
        return this.sendMessage(from, '¿Cuántos deseas?');

      case 'QUANTITY':
        userStates.set(from, 'ADDRESS');
        return this.sendMessage(from, 'Ingresa tu dirección');

      case 'ADDRESS':
        userStates.set(from, 'CONFIRMATION');
        return this.sendMessage(from, '¿Confirmas tu pedido? (sí/no)');

      case 'CONFIRMATION':
        userStates.set(from, 'START');
        return this.sendMessage(from, '✅ Pedido confirmado 🍹');
    }
    const private userOrders = new Map<string, any>();

  }
}
