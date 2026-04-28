import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  async processMessage(body: any) {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const text = message.text?.body;

    console.log('Usuario:', from);
    console.log('Mensaje:', text);

    // 👉 aquí luego conectas el bot
  }
}
