import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BotState, BotStateValue, OrderDraft, emptyDraft } from '../bot/bot-engine.types';

export interface ConversationSnapshot {
  waId: string;
  state: BotStateValue;
  name?: string;
  draft: OrderDraft;
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async load(waId: string, name?: string): Promise<ConversationSnapshot> {
    const row = await this.prisma.conversation.upsert({
      where: { waId },
      update: name ? { name } : {},
      create: { waId, name, state: BotState.START },
    });

    return {
      waId: row.waId,
      state: (row.state as BotStateValue) ?? BotState.START,
      name: row.name ?? undefined,
      draft: (row.draft as OrderDraft | null) ?? emptyDraft(),
    };
  }

  async save(
    waId: string,
    state: BotStateValue,
    draft: OrderDraft,
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { waId },
      data: { state, draft: draft as unknown as Prisma.InputJsonValue },
    });
  }

  /** Has this webhook message id already been handled? Records it if not. */
  async isDuplicate(messageId: string): Promise<boolean> {
    try {
      await this.prisma.processedMessage.create({ data: { id: messageId } });
      return false;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return true;
      }
      throw err;
    }
  }
}
