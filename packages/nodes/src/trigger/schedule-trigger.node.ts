import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';
import { DateTime } from 'luxon';

export class ScheduleTriggerNode implements INode {
  description: NodeDescription = {
    displayName: 'Schedule Trigger',
    name: 'flowforge.scheduleTrigger',
    group: ['trigger'],
    version: 1,
    description: 'Runs the workflow on a schedule using cron or interval',
    icon: 'fa:clock',
    color: '#31C48D',
    inputs: [],
    outputs: [{ type: 'main' }],
    properties: [
      {
        displayName: 'Trigger Interval',
        name: 'rule',
        type: 'options',
        options: [
          { name: 'Every Minute', value: 'everyMinute' },
          { name: 'Every Hour', value: 'everyHour' },
          { name: 'Every Day', value: 'everyDay' },
          { name: 'Every Week', value: 'everyWeek' },
          { name: 'Every Month', value: 'everyMonth' },
          { name: 'Custom (Cron)', value: 'cron' },
          { name: 'Custom Interval', value: 'interval' },
        ],
        default: 'everyHour',
      },
      {
        displayName: 'Cron Expression',
        name: 'cronExpression',
        type: 'string',
        default: '0 * * * *',
        description: 'Standard cron expression (minute hour day month weekday)',
        placeholder: '0 * * * *',
        displayOptions: { show: { rule: ['cron'] } },
      },
      {
        displayName: 'Interval Value',
        name: 'intervalValue',
        type: 'number',
        default: 60,
        description: 'The interval value',
        displayOptions: { show: { rule: ['interval'] } },
      },
      {
        displayName: 'Interval Unit',
        name: 'intervalUnit',
        type: 'options',
        options: [
          { name: 'Seconds', value: 'seconds' },
          { name: 'Minutes', value: 'minutes' },
          { name: 'Hours', value: 'hours' },
        ],
        default: 'minutes',
        displayOptions: { show: { rule: ['interval'] } },
      },
      {
        displayName: 'Timezone',
        name: 'timezone',
        type: 'string',
        default: 'UTC',
        description: 'IANA timezone identifier e.g. America/New_York',
      },
    ],
    defaults: { name: 'Schedule Trigger', color: '#31C48D' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const now = DateTime.now().setZone(context.getNodeParameter<string>('timezone', 0, 'UTC'));
    return [[{
      json: {
        timestamp: now.toISO(),
        timezone: now.zoneName,
        epochMs: now.toMillis(),
        humanReadable: now.toLocaleString(DateTime.DATETIME_FULL),
      },
    }]];
  }
}
