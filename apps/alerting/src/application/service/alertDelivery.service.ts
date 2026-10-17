import { summarizeAlert, type Alert } from '../type/alert.type.js';
import { SENDER_RESULT_KIND } from '../port/alertDelivery.port.js';
import type {
  AlertLogger,
  AlertSender,
  DeliveryOutcome,
  DeliveryUseCase,
  QuarantinePort,
  QuarantineRecord,
  QuarantineReason,
  SenderResult,
} from '../port/alertDelivery.port.js';

export class DeliveryService implements DeliveryUseCase {
  constructor(
    private readonly sender: AlertSender,
    private readonly quarantine: QuarantinePort,
    private readonly clock: () => number = Date.now,
    private readonly logger?: AlertLogger,
  ) {}

  async deliver(alert: Alert, options: { deadline?: number } = {}): Promise<DeliveryOutcome> {
    const now = this.clock();
    if (options.deadline !== undefined && now >= options.deadline) {
      return transient('request_deadline_before_discord');
    }

    let result: SenderResult;
    try {
      result = await this.sender.send(
        summarizeAlert(alert),
        options.deadline === undefined ? {} : { deadline: options.deadline },
      );
    } catch {
      result = { kind: SENDER_RESULT_KIND.TRANSIENT_FAILURE, reason: 'network' };
    }

    switch (result.kind) {
      case SENDER_RESULT_KIND.SUCCESS:
        this.logger?.info?.(
          {
            event: 'discord_delivery_succeeded',
            status: result.status,
            messageId: result.messageId,
            errorId: alert.errorId,
          },
          'Discord delivery succeeded',
        );
        return acknowledged('delivered');
      case SENDER_RESULT_KIND.RATE_LIMITED:
        return transient('discord_rate_limited');
      case SENDER_RESULT_KIND.TRANSIENT_FAILURE:
        return transient(`discord_${result.reason}`);
      case SENDER_RESULT_KIND.PERMANENT_FAILURE:
        return this.quarantinePermanentFailure(result.reason, alert);
    }
  }

  private async quarantinePermanentFailure(
    reason: QuarantineReason,
    alert: Alert,
  ): Promise<DeliveryOutcome> {
    try {
      await this.quarantine.publish(createQuarantineRecord(reason, alert, this.clock));
      return acknowledged('quarantined');
    } catch {
      this.logger?.error?.({ event: 'quarantine_publish_failed' }, 'Quarantine publish failed');
      return transient('quarantine_failed');
    }
  }
}

export function createQuarantineRecord(
  reason: QuarantineReason,
  alert?: Pick<Alert, 'errorId' | 'statusCode' | 'appCode'>,
  clock: () => number = Date.now,
): QuarantineRecord {
  const now = clock();
  return {
    reason,
    receivedAt: new Date(now).toISOString(),
    ...(alert?.errorId === undefined ? {} : { errorId: alert.errorId }),
    ...(alert?.statusCode === undefined ? {} : { statusCode: alert.statusCode }),
    ...(alert?.appCode === undefined ? {} : { appCode: alert.appCode }),
  };
}

function acknowledged(reason: string): DeliveryOutcome {
  return { acknowledged: true, reason };
}

function transient(reason: string): DeliveryOutcome {
  return { acknowledged: false, reason };
}
