import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl } = req;
    const correlationId = req.headers['x-correlation-id'] as string;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const logData = {
        method,
        url: originalUrl,
        statusCode,
        duration: `${duration}ms`,
        correlationId,
      };

      if (statusCode >= 500) {
        this.logger.error(JSON.stringify(logData));
      } else if (statusCode >= 400) {
        this.logger.warn(JSON.stringify(logData));
      } else {
        this.logger.log(JSON.stringify(logData));
      }
    });

    next();
  }
}
