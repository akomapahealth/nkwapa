import { toCsv } from './csv';

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(
      toCsv([
        ['Clinic', 'Pairs'],
        ['Accra', 3],
      ]),
    ).toBe('Clinic,Pairs\r\nAccra,3\r\n');
  });

  it('quotes a cell holding a comma, a quote or a line break', () => {
    expect(toCsv([['Accra, Central', 'Say "hi"', 'two\nlines']])).toBe(
      '"Accra, Central","Say ""hi""","two\nlines"\r\n',
    );
  });

  it.each(['=HYPERLINK("http://x")', '+1', '-2+3', '@SUM(A1)', '\tcmd'])(
    'neutralises %j so a spreadsheet reads it as text, not a formula',
    (value) => {
      expect(toCsv([[value]]).startsWith(`"'`) || toCsv([[value]]).startsWith("'")).toBe(true);
    },
  );

  it('leaves numbers, including negative ones, as numbers', () => {
    expect(toCsv([[-1, 0, true, null, undefined]])).toBe('-1,0,true,,\r\n');
  });
});
