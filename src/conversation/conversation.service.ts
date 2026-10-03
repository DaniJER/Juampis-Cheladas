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

  async load(businessId: string, waId: string, name?: string): Promise<ConversationSnapshot> {
    const row = await this.prisma.conversation.upsert({
      where: { businessId_waId: { businessId, waId } },
      update: name ? { name } : {},
      create: { businessId, waId, name, state: BotState.START },
    });

    return {
      waId: row.waId,
      state: (row.state as BotStateValue) ?? BotState.START,
      name: row.name ?? undefined,
      draft: (row.draft as OrderDraft | null) ?? emptyDraft(),
    };
  }

  async save(
    businessId: string,
    waId: string,
    state: BotStateValue,
    draft: OrderDraft,
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { businessId_waId: { businessId, waId } },
      data: { state, draft: draft as unknown as Prisma.InputJsonValue },
    });
  }

  /** Has this webhook message id already been handled (for this business)?
   *  Records it if not. */
  async isDuplicate(businessId: string, messageId: string): Promise<boolean> {
    try {
      await this.prisma.processedMessage.create({ data: { businessId, id: messageId } });
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
