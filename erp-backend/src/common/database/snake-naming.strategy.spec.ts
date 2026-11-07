import { SnakeNamingStrategy, snakeCase } from './snake-naming.strategy.js';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it.each([
    ['createdAt', 'created_at'],
    ['schoolId', 'school_id'],
    ['passwordChangeRequiredAt', 'password_change_required_at'],
    ['twoFactorConfirmedAt', 'two_factor_confirmed_at'],
    ['ipAddress', 'ip_address'],
    ['address2', 'address2'],
    ['name', 'name'],
  ])('%s -> %s', (property, column) => {
    expect(snakeCase(property)).toBe(column);
    expect(strategy.columnName(property, undefined, [])).toBe(column);
  });

  it('keeps an explicit column name', () => {
    expect(strategy.columnName('line2', 'address_line_2', [])).toBe(
      'address_line_2',
    );
  });

  it('names tables and join columns in snake_case', () => {
    expect(strategy.tableName('StudentRecord')).toBe('student_record');
    expect(strategy.tableName('StudentRecord', 'student_records')).toBe(
      'student_records',
    );
    expect(strategy.joinColumnName('academicYear', 'id')).toBe(
      'academic_year_id',
    );
  });

  it('prefixes embedded columns', () => {
    expect(strategy.columnName('city', undefined, ['homeAddress'])).toBe(
      'home_address_city',
    );
  });
});
