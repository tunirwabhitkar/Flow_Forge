import nodemailer from 'nodemailer';
import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class SendEmailNode implements INode {
  description: NodeDescription = {
    displayName: 'Send Email',
    name: 'flowforge.sendEmail',
    group: ['communication'],
    version: 2,
    description: 'Sends an email via SMTP',
    icon: 'fa:envelope',
    color: '#EA4335',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    credentials: [{ name: 'smtp', required: true }],
    properties: [
      {
        displayName: 'To',
        name: 'toEmail',
        type: 'string',
        default: '',
        placeholder: 'recipient@example.com',
        required: true,
        description: 'Recipient email address (comma-separate multiple)',
      },
      {
        displayName: 'From',
        name: 'fromEmail',
        type: 'string',
        default: '',
        placeholder: 'sender@example.com',
        description: 'Sender email (overrides credential default)',
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        default: '',
        required: true,
      },
      {
        displayName: 'Email Format',
        name: 'emailFormat',
        type: 'options',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'HTML', value: 'html' },
          { name: 'Both', value: 'both' },
        ],
        default: 'text',
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 5 },
        default: '',
        description: 'Plain text email body',
        displayOptions: { show: { emailFormat: ['text', 'both'] } },
      },
      {
        displayName: 'HTML',
        name: 'html',
        type: 'string',
        typeOptions: { rows: 10, language: 'html' },
        default: '',
        description: 'HTML email body',
        displayOptions: { show: { emailFormat: ['html', 'both'] } },
      },
      {
        displayName: 'CC',
        name: 'ccEmail',
        type: 'string',
        default: '',
      },
      {
        displayName: 'BCC',
        name: 'bccEmail',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Reply To',
        name: 'replyTo',
        type: 'string',
        default: '',
      },
    ],
    defaults: { name: 'Send Email', color: '#EA4335' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const items = context.getInputData();
    const credentials = await context.getCredentials<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    }>('smtp');

    const transporter = nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.secure,
      auth: {
        user: credentials.user,
        pass: credentials.password,
      },
    });

    const results = [];
    for (let i = 0; i < items.length; i++) {
      const to = context.getNodeParameter<string>('toEmail', i);
      const from = context.getNodeParameter<string>('fromEmail', i) || credentials.user;
      const subject = context.getNodeParameter<string>('subject', i);
      const emailFormat = context.getNodeParameter<string>('emailFormat', i, 'text');
      const text = context.getNodeParameter<string>('text', i, '');
      const html = context.getNodeParameter<string>('html', i, '');
      const cc = context.getNodeParameter<string>('ccEmail', i, '');
      const bcc = context.getNodeParameter<string>('bccEmail', i, '');
      const replyTo = context.getNodeParameter<string>('replyTo', i, '');

      const mailOptions: nodemailer.SendMailOptions = {
        from, to, subject,
        ...(emailFormat !== 'html' && { text }),
        ...(emailFormat !== 'text' && { html }),
        ...(cc && { cc }),
        ...(bcc && { bcc }),
        ...(replyTo && { replyTo }),
      };

      const info = await transporter.sendMail(mailOptions);
      results.push({
        json: {
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
        pairedItem: { item: i },
      });
    }

    return [results];
  }
}
