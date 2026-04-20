if (process.env.SENTRY_DSN) {
  void (async () => {
    try {
      const Sentry = await import('@sentry/nestjs');
      const { nodeProfilingIntegration } = await import('@sentry/profiling-node');

      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV ?? 'development',
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Sentry setup error';
      console.warn(`Sentry initialization skipped: ${message}`);
    }
  })();
}
