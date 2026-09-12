/**
 * 密码校验（NIST SP 800-63B 风格）：
 * - 接受任意字符（包括全角字符、中文、空格等），不做全半角转换
 * - 仅限制长度 8~64 位（64 位上限是因为 BCrypt 超过 72 字节会静默截断）
 * - 拒绝常见弱口令
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  'password', 'password1', 'qwerty123', 'abc12345', 'admin123', 'admin1234',
  'qwer1234', 'iloveyou', '12312312', '1qaz2wsx', 'qazwsx12', 'aaaaaaaa',
]);

/**
 * 校验密码，返回错误信息；合法时返回 null
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `密码长度至少${PASSWORD_MIN_LENGTH}位`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `密码长度不能超过${PASSWORD_MAX_LENGTH}位`;
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return '密码过于简单，请避免使用常见弱口令（如 12345678、password 等）';
  }
  return null;
}

export const PASSWORD_RULE_HINT = `新密码长度 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH} 位，任意字符均可（含全角/中文），避免使用常见弱口令`;
