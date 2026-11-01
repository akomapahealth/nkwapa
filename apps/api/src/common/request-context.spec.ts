import type { Request } from 'express';
import { getRequestIp } from './request-context';

const request = (headers: Record<string, string>, ip = '10.0.0.1') =>
  ({ headers, ip }) as unknown as Request;

describe('getRequestIp', () => {
  afterEach(() => delete process.env.CLIENT_IP_HEADER);

  it('uses the first X-Forwarded-For entry when no trusted header is configured', () => {
    expect(getRequestIp(request({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }))).toBe(
      '198.51.100.7',
    );
  });

  it('ignores a spoofed X-Forwarded-For once the edge header is configured', () => {
    process.env.CLIENT_IP_HEADER = 'True-Client-IP';
    expect(
      getRequestIp(
        request({ 'x-forwarded-for': '1.2.3.4, 203.0.113.5', 'true-client-ip': '203.0.113.5' }),
      ),
    ).toBe('203.0.113.5');
  });

  it('falls back to the socket address, not X-Forwarded-For, when the edge header is missing', () => {
    process.env.CLIENT_IP_HEADER = 'true-client-ip';
    expect(getRequestIp(request({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.1');
  });

  it('falls back to the socket address with no headers at all', () => {
    expect(getRequestIp(request({}))).toBe('10.0.0.1');
  });
});
