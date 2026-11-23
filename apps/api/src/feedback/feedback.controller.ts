import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FeedbackKind, FeedbackStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.controller';
import { type AuthedRequest, Public, Roles } from '../auth/guards';
import { parseBody, platoUsernameSchema } from '../auth/schemas';
import { FeedbackService } from './feedback.service';

/**
 * Le message est du texte libre affiché au propriétaire (React l'échappe) : on garde les retours à
 * la ligne mais aucun autre caractère de contrôle ou invisible.
 */
const messageSchema = z
  .string()
  .trim()
  .min(5, '5 caractères au moins')
  .max(2000, '2 000 caractères au maximum')
  .refine(
    (v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v.replace(/[\n\r\t]/g, '')),
    'Caractères non autorisés',
  );

const submitSchema = z.object({ kind: z.nativeEnum(FeedbackKind), message: messageSchema });
const publicSubmitSchema = submitSchema.extend({ contact: platoUsernameSchema.optional() });
const statusSchema = z.object({ status: z.nativeEnum(FeedbackStatus) });
const listQuerySchema = z.object({ status: z.nativeEnum(FeedbackStatus).optional() });
const idSchema = z.string().uuid();

/** Retours des admins (avec leur compte) et boîte de réception du propriétaire de la plateforme. */
@Controller('feedback')
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}

  /** Un admin connecté dépose un retour : le propriétaire sait de qui il vient. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  submit(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(submitSchema, body);
    return this.feedback.submit({ ...input, authorId: requireAuth(req).user.id });
  }

  @Roles(Role.PLATFORM_OWNER)
  @Get()
  list(@Query() query: unknown) {
    return this.feedback.list(parseBody(listQuerySchema, query).status);
  }

  @Roles(Role.PLATFORM_OWNER)
  @HttpCode(204)
  @Patch(':feedbackId')
  async setStatus(@Param('feedbackId') feedbackId: string, @Body() body: unknown) {
    await this.feedback.setStatus(
      parseBody(idSchema, feedbackId),
      parseBody(statusSchema, body).status,
    );
  }

  @Roles(Role.PLATFORM_OWNER)
  @HttpCode(204)
  @Delete(':feedbackId')
  async remove(@Param('feedbackId') feedbackId: string) {
    await this.feedback.remove(parseBody(idSchema, feedbackId));
  }

  /** Supprime les retours traités depuis plus d'un an. */
  @Roles(Role.PLATFORM_OWNER)
  @HttpCode(200)
  @Post('purge')
  purge() {
    return this.feedback.purge();
  }
}

/** Retour d'un joueur sans compte, depuis la page publique : anonyme, avec un pseudo facultatif. */
@Controller('public/feedback')
export class PublicFeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post()
  submit(@Body() body: unknown) {
    return this.feedback.submit(parseBody(publicSubmitSchema, body));
  }
}
