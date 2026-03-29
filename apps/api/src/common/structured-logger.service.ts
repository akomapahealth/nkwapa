import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger extends ConsoleLogger {
  private formatStructuredLine(level: string, message: string, context?: string) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? 'Application',
      message,
      service: 'nkwapa-api',
    });
  }

  log(message: string, context?: string) {
    process.stdout.write(this.formatStructuredLine('info', message, context) + '\n');
  }

  error(message: string, trace?: string, context?: string) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context: context ?? this.context ?? 'Application',
      message,
      trace,
      service: 'nkwapa-api',
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  warn(message: string, context?: string) {
    process.stdout.write(this.formatStructuredLine('warn', message, context) + '\n');
  }

  debug(message: string, context?: string) {
    if (process.env.NODE_ENV === 'production') return;
    process.stdout.write(this.formatStructuredLine('debug', message, context) + '\n');
  }
}
