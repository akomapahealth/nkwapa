import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './request-context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[REQUEST_ID_HEADER] as string) ||
      (req.headers[CORRELATION_ID_HEADER] as string) ||
      uuidv4();
    req.headers[REQUEST_ID_HEADER] = correlationId;
    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(REQUEST_ID_HEADER, correlationId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
