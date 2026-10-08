import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CompleteWelcomeTourDto } from './welcome-tour.dto';

function errorsFor(body: unknown) {
  return validateSync(plainToInstance(CompleteWelcomeTourDto, body)).map((e) => e.property);
}

describe('CompleteWelcomeTourDto', () => {
  it('accepts a positive whole version', () => {
    expect(errorsFor({ version: 1 })).toEqual([]);
    expect(errorsFor({ version: '2' })).toEqual([]);
  });

  it.each([
    [{}],
    [{ version: 0 }],
    [{ version: -1 }],
    [{ version: 1.5 }],
    [{ version: 1001 }],
    [{ version: 'one' }],
  ])('refuses %j', (body) => {
    expect(errorsFor(body)).toEqual(['version']);
  });
});
