/**
 * 轻量级伪 SQL 解析执行引擎
 * 在 employees 数组上执行类 SQL 查询
 */

export interface SQLColumn {
  field: string;
  alias: string;
  aggregate?: string; // avg, sum, count, max, min
}

export interface SQLWhere {
  field: string;
  op: string;
  value: any;
}

export interface SQLOrderBy {
  field: string;
  desc: boolean;
}

export interface ParsedSQL {
  select: SQLColumn[];
  from: string;
  where: SQLWhere[];
  whereLogic: 'AND' | 'OR';
  orderBy: SQLOrderBy[];
  limit: number;
  groupBy: string | null;
}

export interface SQLResult {
  columns: string[];
  rows: any[];
  error?: string;
}

function getValue(row: any, field: string): any {
  if (field.includes('/')) {
    const parts = field.split('/');
    let val = row;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) break;
    }
    return val;
  }
  return row[field];
}

function parseValue(valStr: string): any {
  const trimmed = valStr.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'null') return null;
  if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  return trimmed;
}

function tokenizeWhere(whereClause: string): SQLWhere[] {
  const conditions: SQLWhere[] = [];
  // 先按 AND 分割（简化处理，不支持 OR 混合优先级）
  const parts = whereClause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // 匹配: 字段 操作符 值
    // 支持: >=, <=, !=, =, >, <
    const match = trimmed.match(/^(.+?)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
    if (match) {
      conditions.push({
        field: match[1].trim(),
        op: match[2].trim(),
        value: parseValue(match[3].trim()),
      });
    }
  }
  return conditions;
}

export function parseSQL(sql: string): ParsedSQL {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  const result: ParsedSQL = {
    select: [],
    from: 'employees',
    where: [],
    whereLogic: 'AND',
    orderBy: [],
    limit: 0,
    groupBy: null,
  };

  // SELECT
  const selectMatch = normalized.match(/SELECT\s+(.+?)\s+FROM\s+/i);
  if (selectMatch) {
    const selectPart = selectMatch[1].trim();
    const cols = selectPart.split(',').map(s => s.trim()).filter(Boolean);
    for (const col of cols) {
      // 检查聚合函数: AVG(字段) AS 别名
      const aggMatch = col.match(/^(AVG|SUM|COUNT|MAX|MIN)\s*\((.+?)\)\s*(?:AS\s+(.+))?$/i);
      if (aggMatch) {
        result.select.push({
          field: aggMatch[2].trim(),
          alias: (aggMatch[3] || `${aggMatch[1].toUpperCase()}(${aggMatch[2].trim()})`).trim(),
          aggregate: aggMatch[1].toLowerCase(),
        });
      } else {
        const aliasMatch = col.match(/^(.+?)\s+AS\s+(.+)$/i);
        if (aliasMatch) {
          result.select.push({ field: aliasMatch[1].trim(), alias: aliasMatch[2].trim() });
        } else {
          result.select.push({ field: col, alias: col });
        }
      }
    }
  }

  // FROM
  const fromMatch = normalized.match(/FROM\s+(\w+)/i);
  if (fromMatch) result.from = fromMatch[1];

  // WHERE
  const whereMatch = normalized.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
  if (whereMatch) {
    result.where = tokenizeWhere(whereMatch[1]);
  }

  // GROUP BY
  const groupMatch = normalized.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  if (groupMatch) {
    result.groupBy = groupMatch[1].trim();
  }

  // ORDER BY
  const orderMatch = normalized.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
  if (orderMatch) {
    const orderParts = orderMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const part of orderParts) {
      const desc = part.toUpperCase().endsWith(' DESC');
      const field = part.replace(/\s+(DESC|ASC)$/i, '').trim();
      result.orderBy.push({ field, desc });
    }
  }

  // LIMIT
  const limitMatch = normalized.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) result.limit = parseInt(limitMatch[1]);

  return result;
}

function evaluateCondition(row: any, cond: SQLWhere): boolean {
  const val = getValue(row, cond.field);
  const cval = cond.value;
  const op = cond.op;
  if (op === '>=') return Number(val) >= Number(cval);
  if (op === '<=') return Number(val) <= Number(cval);
  if (op === '>') return Number(val) > Number(cval);
  if (op === '<') return Number(val) < Number(cval);
  if (op === '=') return String(val) === String(cval);
  if (op === '!=') return String(val) !== String(cval);
  return false;
}

function aggregateValue(items: any[], func: string, field: string): number {
  const values = items.map(item => Number(getValue(item, field) || 0)).filter(v => !isNaN(v));
  if (values.length === 0) return 0;
  switch (func) {
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'count': return items.length;
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
    default: return 0;
  }
}

export function executeSQL(sql: string, employees: any[]): SQLResult {
  try {
    const parsed = parseSQL(sql);
    let data = [...employees];

    // WHERE
    if (parsed.where.length > 0) {
      data = data.filter(row => parsed.where.every(cond => evaluateCondition(row, cond)));
    }

    // GROUP BY + SELECT with aggregate
    if (parsed.groupBy) {
      const groups: Record<string, any[]> = {};
      data.forEach(row => {
        const key = String(getValue(row, parsed.groupBy!) || '未知');
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      data = Object.entries(groups).map(([key, items]) => {
        const row: any = { [parsed.groupBy!]: key, _count: items.length };
        for (const col of parsed.select) {
          if (col.aggregate) {
            row[col.alias] = aggregateValue(items, col.aggregate, col.field);
          } else {
            row[col.alias] = getValue(items[0], col.field);
          }
        }
        return row;
      });
    } else if (parsed.select.length > 0 && parsed.select.some(c => c.aggregate)) {
      // 没有 GROUP BY 但有聚合函数：对整个结果集聚合
      const row: any = {};
      for (const col of parsed.select) {
        if (col.aggregate) {
          row[col.alias] = aggregateValue(data, col.aggregate, col.field);
        } else {
          row[col.alias] = data.length > 0 ? getValue(data[0], col.field) : null;
        }
      }
      data = [row];
    } else if (parsed.select.length > 0) {
      // 普通 SELECT（非聚合）
      data = data.map(row => {
        const projected: any = {};
        for (const col of parsed.select) {
          projected[col.alias] = getValue(row, col.field);
        }
        return projected;
      });
    }

    // ORDER BY
    if (parsed.orderBy.length > 0) {
      data.sort((a, b) => {
        for (const ob of parsed.orderBy) {
          const av = getValue(a, ob.field);
          const bv = getValue(b, ob.field);
          const an = Number(av);
          const bn = Number(bv);
          if (!isNaN(an) && !isNaN(bn)) {
            if (an !== bn) return ob.desc ? bn - an : an - bn;
          } else {
            const cmp = String(av).localeCompare(String(bv));
            if (cmp !== 0) return ob.desc ? -cmp : cmp;
          }
        }
        return 0;
      });
    }

    // LIMIT
    if (parsed.limit > 0) {
      data = data.slice(0, parsed.limit);
    }

    const columns = parsed.select.length > 0
      ? parsed.select.map(c => c.alias)
      : (data.length > 0 ? Object.keys(data[0]) : []);

    return { columns, rows: data };
  } catch (err: any) {
    return { columns: [], rows: [], error: err.message || '查询执行失败' };
  }
}
