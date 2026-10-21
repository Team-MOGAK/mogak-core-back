import { Global, Module } from '@nestjs/common';

import { ALERT_NOTIFIER } from './alertNotifier';
import { DiscordWebhookNotifier } from './discordWebhookNotifier';

@Global()
@Module({
  providers: [
    { provide: DiscordWebhookNotifier, useFactory: () => new DiscordWebhookNotifier() },
    { provide: ALERT_NOTIFIER, useExisting: DiscordWebhookNotifier },
  ],
  exports: [ALERT_NOTIFIER, DiscordWebhookNotifier],
})
export class AlertingModule {}
