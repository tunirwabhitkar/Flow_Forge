import type { INode, NodeDescription, NodeExecutionContext, NodeOutput_data } from '@flowforge/core';

export class PostgresNode implements INode {
  description: NodeDescription = {
    displayName: 'Postgres',
    name: 'flowforge.postgres',
    group: ['database'],
    version: 2,
    description: 'Get, add, and update data in PostgreSQL',
    icon: 'file:postgres.svg',
    color: '#336791',
    inputs: [{ type: 'main' }],
    outputs: [{ type: 'main' }],
    credentials: [{ name: 'postgres', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Execute Query', value: 'executeQuery', description: 'Execute a raw SQL query' },
          { name: 'Insert', value: 'insert', description: 'Insert rows into a table' },
          { name: 'Update', value: 'update', description: 'Update rows in a table' },
          { name: 'Upsert', value: 'upsert', description: 'Insert or update rows' },
          { name: 'Delete', value: 'delete', description: 'Delete rows from a table' },
          { name: 'Select', value: 'select', description: 'Select rows from a table' },
        ],
        default: 'executeQuery',
      },
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        typeOptions: { rows: 10, language: 'json' },
        default: '',
        required: true,
        description: 'SQL query to execute (use $1, $2 for parameterized queries)',
        displayOptions: { show: { operation: ['executeQuery'] } },
        noDataExpression: true,
      },
      {
        displayName: 'Table',
        name: 'table',
        type: 'string',
        default: '',
        required: true,
        description: 'The table to operate on',
        displayOptions: { show: { operation: ['insert', 'update', 'upsert', 'delete', 'select'] } },
      },
      {
        displayName: 'Columns',
        name: 'columns',
        type: 'string',
        default: '*',
        description: 'Comma-separated columns to select (for SELECT operation)',
        displayOptions: { show: { operation: ['select'] } },
      },
      {
        displayName: 'WHERE Clause',
        name: 'whereClause',
        type: 'string',
        default: '',
        description: 'SQL WHERE clause (without the WHERE keyword)',
        displayOptions: { show: { operation: ['select', 'update', 'delete'] } },
      },
      {
        displayName: 'Return Fields',
        name: 'returnFields',
        type: 'string',
        default: '*',
        description: 'Fields to return (RETURNING clause)',
        displayOptions: { show: { operation: ['insert', 'update', 'upsert', 'delete'] } },
      },
      {
        displayName: 'Query Parameters',
        name: 'queryParams',
        type: 'string',
        default: '',
        description: 'Comma-separated parameter values for parameterized queries',
        displayOptions: { show: { operation: ['executeQuery'] } },
      },
    ],
    defaults: { name: 'Postgres', color: '#336791' },
  };

  async execute(context: NodeExecutionContext): Promise<NodeOutput_data> {
    const { Client } = await import('pg');
    const creds = await context.getCredentials<{
      host: string; port: number; database: string; user: string; password: string; ssl: boolean;
    }>('postgres');

    const client = new Client({
      host: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : false,
    });

    await client.connect();

    try {
      const items = context.getInputData();
      const operation = context.getNodeParameter<string>('operation', 0);
      const results = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        let queryResult;

        if (operation === 'executeQuery') {
          const query = context.getNodeParameter<string>('query', i);
          const paramsRaw = context.getNodeParameter<string>('queryParams', i, '');
          const params = paramsRaw ? paramsRaw.split(',').map((p) => p.trim()) : [];
          queryResult = await client.query(query, params);
        } else if (operation === 'select') {
          const table = context.getNodeParameter<string>('table', i);
          const columns = context.getNodeParameter<string>('columns', i, '*');
          const where = context.getNodeParameter<string>('whereClause', i, '');
          const sql = `SELECT ${columns} FROM ${table}${where ? ` WHERE ${where}` : ''}`;
          queryResult = await client.query(sql);
        } else if (operation === 'insert') {
          const table = context.getNodeParameter<string>('table', i);
          const returning = context.getNodeParameter<string>('returnFields', i, '*');
          const fields = item.json;
          const keys = Object.keys(fields);
          const values = Object.values(fields);
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING ${returning}`;
          queryResult = await client.query(sql, values);
        } else if (operation === 'update') {
          const table = context.getNodeParameter<string>('table', i);
          const where = context.getNodeParameter<string>('whereClause', i);
          const returning = context.getNodeParameter<string>('returnFields', i, '*');
          const fields = item.json;
          const keys = Object.keys(fields);
          const values = Object.values(fields);
          const setClause = keys.map((k, idx) => `${k} = $${idx + 1}`).join(', ');
          const sql = `UPDATE ${table} SET ${setClause} WHERE ${where} RETURNING ${returning}`;
          queryResult = await client.query(sql, values);
        } else if (operation === 'delete') {
          const table = context.getNodeParameter<string>('table', i);
          const where = context.getNodeParameter<string>('whereClause', i);
          const returning = context.getNodeParameter<string>('returnFields', i, '*');
          const sql = `DELETE FROM ${table} WHERE ${where} RETURNING ${returning}`;
          queryResult = await client.query(sql);
        }

        const rows = (queryResult?.rows ?? []) as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          results.push({ json: { success: true, rowCount: queryResult?.rowCount ?? 0 }, pairedItem: { item: i } });
        } else {
          for (const row of rows) {
            results.push({ json: row, pairedItem: { item: i } });
          }
        }
      }

      return [results];
    } finally {
      await client.end();
    }
  }
}
